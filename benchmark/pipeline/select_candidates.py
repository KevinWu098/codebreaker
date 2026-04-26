"""Select final candidates for Devin dispatch via CWE mapping + stratified sampling.

Reads the filtered JSONL from Stage 1, deduplicates, maps CWE IDs to one of
the 13 vulnerability classes, applies an optional CVSS floor, and performs
stratified random sampling so every class is represented.

Use ``--preserve`` to pin already-curated GHSAs (read from existing task
files) so they are always included in the output.  Remaining slots are
filled via the usual stratified sample.

Usage:

    uv run python -m pipeline.select_candidates
    uv run python -m pipeline.select_candidates --target 500 --overprovision 2.5
    uv run python -m pipeline.select_candidates --preserve ../data/tasks --target 500
    uv run python -m pipeline.select_candidates --cvss-floor 0  # no floor
"""

from __future__ import annotations

import argparse
import glob as globmod
import json
import math
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from .lib.cwe_map import classify

DEFAULT_INPUT = Path(__file__).resolve().parent / "output" / "filtered.jsonl"
DEFAULT_OUTPUT = Path(__file__).resolve().parent / "output" / "candidates.jsonl"
DEFAULT_REJECTED = Path(__file__).resolve().parent / "output" / "select_rejected.jsonl"


def _load_preserved_ghsa_ids(tasks_dir: Path) -> set[str]:
    """Read GHSA IDs from existing task JSON files."""
    ids: set[str] = set()
    for path in sorted(tasks_dir.glob("*.json")):
        with path.open() as f:
            data = json.load(f)
        ghsa = data.get("ghsa_id")
        if ghsa:
            ids.add(ghsa)
    return ids


def _load_and_dedup(path: Path) -> list[dict[str, Any]]:
    seen: set[str] = set()
    records: list[dict[str, Any]] = []
    dupes = 0
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            gid = rec["ghsa_id"]
            if gid in seen:
                dupes += 1
                continue
            seen.add(gid)
            records.append(rec)
    if dupes:
        print(f"  Removed {dupes} duplicate GHSA IDs")
    return records


def _stratified_sample(
    by_class: dict[str, list[dict[str, Any]]],
    target_per_class: int,
    rng: random.Random,
    preserved_per_class: dict[str, int] | None = None,
) -> list[dict[str, Any]]:
    """Sample up to *target_per_class* from each class, offset by preserved counts.

    When *preserved_per_class* is provided, the per-class target is reduced
    by the number already preserved so the final combined distribution stays
    balanced.  Classes with fewer candidates than the target are taken in full.
    Within each class, higher-CVSS candidates are kept with higher
    probability by sorting descending and taking the first N after a
    partial shuffle of equal-CVSS groups.
    """
    preserved_per_class = preserved_per_class or {}
    selected: list[dict[str, Any]] = []
    for cls in sorted(by_class):
        pool = by_class[cls]
        already = preserved_per_class.get(cls, 0)
        need = max(0, target_per_class - already)
        rng.shuffle(pool)
        pool.sort(key=lambda r: r.get("cvss") or 0, reverse=True)
        take = min(len(pool), need)
        selected.extend(pool[:take])
    return selected


def _classify_records(
    records: list[dict[str, Any]],
    cvss_floor: float,
) -> tuple[
    dict[str, list[dict[str, Any]]],
    list[dict[str, Any]],
    int, int, int,
]:
    """Map records to vulnerability classes and apply CVSS floor.

    Returns (by_class, rejections, reject_no_cwe, reject_unmappable, reject_cvss).
    """
    by_class: dict[str, list[dict[str, Any]]] = defaultdict(list)
    rejections: list[dict[str, Any]] = []
    reject_no_cwe = 0
    reject_unmappable = 0
    reject_cvss = 0

    for rec in records:
        cwes = rec.get("cwe_ids") or []
        if not cwes:
            reject_no_cwe += 1
            rejections.append({
                "ghsa_id": rec["ghsa_id"], "reason": "no_cwe",
                "summary": rec.get("summary", "")[:200],
            })
            continue

        cls = classify(cwes)
        if cls is None:
            reject_unmappable += 1
            rejections.append({
                "ghsa_id": rec["ghsa_id"], "reason": "unmappable_cwe",
                "cwe_ids": cwes,
                "summary": rec.get("summary", "")[:200],
            })
            continue

        cvss = rec.get("cvss") or 0
        if cvss < cvss_floor:
            reject_cvss += 1
            rejections.append({
                "ghsa_id": rec["ghsa_id"], "reason": "cvss_below_floor",
                "cvss": cvss,
                "summary": rec.get("summary", "")[:200],
            })
            continue

        rec["vuln_class"] = cls
        by_class[cls].append(rec)

    return by_class, rejections, reject_no_cwe, reject_unmappable, reject_cvss


def run(
    *,
    input_path: Path,
    output_path: Path,
    rejected_path: Path,
    target: int,
    overprovision: float,
    cvss_floor: float,
    seed: int,
    preserve_dir: Path | None = None,
) -> None:
    print(f"  Input:         {input_path}")
    print(f"  Target tasks:  {target}")
    print(f"  Overprovision: {overprovision}x → ~{int(target * overprovision)} candidates")
    print(f"  CVSS floor:    {cvss_floor}")
    print(f"  Seed:          {seed}")

    preserved_ids: set[str] = set()
    if preserve_dir:
        preserved_ids = _load_preserved_ghsa_ids(preserve_dir)
        print(f"  Preserve:      {len(preserved_ids)} GHSAs from {preserve_dir}")

    print()

    records = _load_and_dedup(input_path)
    print(f"  Unique records: {len(records)}")

    preserved_records: list[dict[str, Any]] = []
    pool_records: list[dict[str, Any]] = []

    if preserved_ids:
        for rec in records:
            if rec["ghsa_id"] in preserved_ids:
                preserved_records.append(rec)
            else:
                pool_records.append(rec)

        found_ids = {r["ghsa_id"] for r in preserved_records}
        missing = preserved_ids - found_ids
        if missing:
            print(f"  WARNING: {len(missing)} preserved GHSAs not found in filtered input:")
            for gid in sorted(missing)[:10]:
                print(f"    {gid}")
            if len(missing) > 10:
                print(f"    ... and {len(missing) - 10} more")

        print(f"  Pinned from preserve: {len(preserved_records)}")
        print(f"  Remaining pool:       {len(pool_records)}")
    else:
        pool_records = records

    by_class, rejections, reject_no_cwe, reject_unmappable, reject_cvss = (
        _classify_records(pool_records, cvss_floor)
    )

    # Also classify preserved records (skip CVSS floor — they're already curated)
    preserved_classified: list[dict[str, Any]] = []
    preserved_unclassified = 0
    if preserved_records:
        for rec in preserved_records:
            cwes = rec.get("cwe_ids") or []
            cls = classify(cwes) if cwes else None
            if cls:
                rec["vuln_class"] = cls
            preserved_classified.append(rec)
            if not cls:
                preserved_unclassified += 1
        if preserved_unclassified:
            print(f"  WARNING: {preserved_unclassified} preserved GHSAs could not be classified (kept anyway)")

    mappable = sum(len(v) for v in by_class.values())
    print(f"  Mappable after filters: {mappable}")
    print(f"  Rejected — no CWE: {reject_no_cwe}, unmappable: {reject_unmappable}, CVSS floor: {reject_cvss}")
    print()

    print("  Available per class (new pool only):")
    for cls in sorted(by_class):
        print(f"    {cls:25s} {len(by_class[cls]):>5d}")
    print()

    total_target = int(target * overprovision)
    new_needed = max(0, total_target - len(preserved_classified))

    preserved_dist = Counter(r.get("vuln_class", "unclassified") for r in preserved_classified)

    if new_needed > 0 and by_class:
        num_classes = len(by_class)
        target_per_class = max(1, math.ceil(total_target / num_classes))
        print(f"  Need {new_needed} new candidates → target {target_per_class} per class ({num_classes} classes), offset by preserved")

        rng = random.Random(seed)
        new_selected = _stratified_sample(by_class, target_per_class, rng, preserved_per_class=preserved_dist)
    else:
        new_selected = []
        print(f"  Preserved records ({len(preserved_classified)}) already meet target ({total_target}), no new sampling needed")

    selected = preserved_classified + new_selected

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w") as f:
        for rec in selected:
            f.write(json.dumps(rec, separators=(",", ":")))
            f.write("\n")

    with rejected_path.open("w") as f:
        for rej in rejections:
            f.write(json.dumps(rej, separators=(",", ":")))
            f.write("\n")

    final_dist = Counter(r.get("vuln_class", "unclassified") for r in selected)
    eco_dist = Counter(r.get("ecosystem", "unknown") for r in selected)

    print(f"\n  Selected: {len(selected)} candidates -> {output_path}")
    print(f"    Preserved: {len(preserved_classified)}")
    print(f"    New:       {len(new_selected)}")
    print(f"  Rejections logged -> {rejected_path}")
    print("\n  Final class distribution (preserved + new):")
    for cls, count in final_dist.most_common():
        p = preserved_dist.get(cls, 0)
        print(f"    {cls:25s} {count:>5d}  (preserved: {p})")
    print("\n  Final ecosystem distribution:")
    for eco, count in eco_dist.most_common():
        print(f"    {eco:12s} {count:>5d}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Select and sample ECVEBench candidates for Devin dispatch."
    )
    parser.add_argument(
        "--input", type=Path, default=DEFAULT_INPUT,
        help=f"Input JSONL from filter step (default: {DEFAULT_INPUT}).",
    )
    parser.add_argument(
        "--output", type=Path, default=DEFAULT_OUTPUT,
        help=f"Output JSONL of selected candidates (default: {DEFAULT_OUTPUT}).",
    )
    parser.add_argument(
        "--rejected", type=Path, default=DEFAULT_REJECTED,
        help=f"Rejected candidates JSONL (default: {DEFAULT_REJECTED}).",
    )
    parser.add_argument(
        "--preserve", type=Path, default=None,
        help="Directory of existing task JSON files whose GHSAs are pinned in the output.",
    )
    parser.add_argument(
        "--target", type=int, default=500,
        help="Target number of final benchmark tasks (default: 500).",
    )
    parser.add_argument(
        "--overprovision", type=float, default=2.5,
        help="Overprovision factor to account for Devin rejections (default: 2.5).",
    )
    parser.add_argument(
        "--cvss-floor", type=float, default=4.0,
        help="Minimum CVSS score (default: 4.0). Set to 0 to disable.",
    )
    parser.add_argument(
        "--seed", type=int, default=42,
        help="Random seed for reproducible sampling (default: 42).",
    )
    args = parser.parse_args(argv)

    if not args.input.exists():
        print(f"error: input file not found: {args.input}", file=sys.stderr)
        return 1

    if args.preserve and not args.preserve.is_dir():
        print(f"error: preserve path is not a directory: {args.preserve}", file=sys.stderr)
        return 1

    print("ECVEBench Candidate Selection")
    run(
        input_path=args.input,
        output_path=args.output,
        rejected_path=args.rejected,
        target=args.target,
        overprovision=args.overprovision,
        cvss_floor=args.cvss_floor,
        seed=args.seed,
        preserve_dir=args.preserve,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
