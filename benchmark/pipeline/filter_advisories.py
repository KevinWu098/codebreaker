"""Filter the GitHub Advisory Database down to curatable candidates.

Paginates through all reviewed GHSAs, applies cheap metadata filters
(no API calls beyond advisory listing), and writes passing GHSA IDs
with metadata to a JSONL file for downstream stratified sampling and
Devin agent dispatch.

Usage:

    GITHUB_TOKEN=ghp_... uv run python -m pipeline.filter_advisories
    GITHUB_TOKEN=ghp_... uv run python -m pipeline.filter_advisories --max-pages 2
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .lib.filters import (
    extract_cwe_ids,
    extract_cvss,
    extract_ecosystem,
    has_cvss,
    has_description,
    has_reference_url,
    is_english,
    is_single_package,
)
from .lib.github_client import GitHubClient

DEFAULT_OUTPUT = Path(__file__).resolve().parent / "output" / "filtered.jsonl"
DEFAULT_REJECTED = Path(__file__).resolve().parent / "output" / "rejected.jsonl"
DEFAULT_CHECKPOINT = Path(__file__).resolve().parent / "output" / "filter_checkpoint.json"


def _load_checkpoint(path: Path) -> dict[str, Any]:
    if path.exists():
        with path.open() as f:
            return json.load(f)
    return {
        "last_cursor": None,
        "advisories_seen": 0,
        "candidates_written": 0,
        "dropped": {},
        "updated_at": None,
    }


def _save_checkpoint(path: Path, state: dict[str, Any]) -> None:
    state["updated_at"] = datetime.now(timezone.utc).isoformat()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with tmp.open("w") as f:
        json.dump(state, f, indent=2)
        f.write("\n")
    tmp.rename(path)


def _load_seen_ids(output_path: Path) -> set[str]:
    seen: set[str] = set()
    if not output_path.exists():
        return seen
    with output_path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            seen.add(json.loads(line)["ghsa_id"])
    return seen


def _drop(state: dict[str, Any], reason: str | None) -> None:
    if reason:
        state["dropped"][reason] = state["dropped"].get(reason, 0) + 1


FILTERS: list[tuple[str, Any]] = [
    ("has_description", lambda adv: has_description(adv)),
    ("is_english", lambda adv: is_english(adv.get("description", ""))),
    ("is_single_package", lambda adv: is_single_package(adv)),
    ("has_reference_url", lambda adv: has_reference_url(adv)),
    ("has_cvss", lambda adv: has_cvss(adv)),
]


def _process_advisory(
    advisory: dict[str, Any],
    seen: set[str],
    state: dict[str, Any],
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Returns (candidate_record, rejection_record). Exactly one is non-None."""
    ghsa_id = advisory.get("ghsa_id", "")

    if ghsa_id in seen:
        _drop(state, "dedup")
        return None, {"ghsa_id": ghsa_id, "reason": "dedup"}

    for _name, fn in FILTERS:
        passed, reason = fn(advisory)
        if not passed:
            _drop(state, reason)
            return None, {
                "ghsa_id": ghsa_id,
                "reason": reason,
                "summary": (advisory.get("summary") or "")[:200],
            }

    cve_id: str | None = None
    for ident in advisory.get("identifiers") or []:
        if isinstance(ident, dict) and ident.get("type") == "CVE":
            cve_id = ident.get("value")
            break

    record = {
        "ghsa_id": ghsa_id,
        "cve_id": cve_id,
        "severity": advisory.get("severity"),
        "cvss": extract_cvss(advisory),
        "cwe_ids": extract_cwe_ids(advisory),
        "ecosystem": extract_ecosystem(advisory),
        "summary": (advisory.get("summary") or "")[:200],
        "published_at": advisory.get("published_at", ""),
    }

    seen.add(ghsa_id)
    return record, None


def run(
    *,
    token: str,
    output_path: Path,
    rejected_path: Path,
    checkpoint_path: Path,
    max_pages: int | None = None,
) -> None:
    state = _load_checkpoint(checkpoint_path)
    seen = _load_seen_ids(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    pages_fetched = 0
    cursor = state["last_cursor"]

    with GitHubClient(token) as gh:
        while True:
            if max_pages is not None and pages_fetched >= max_pages:
                print(f"  Reached --max-pages={max_pages}, stopping.")
                break

            print(f"  Fetching page {pages_fetched + 1} (cursor={cursor!r})...")
            page = gh.list_advisories(after=cursor)

            if not page.advisories:
                print("  No more advisories.")
                break

            page_size = len(page.advisories)
            page_candidates = 0

            for _i, advisory in enumerate(page.advisories, start=1):
                state["advisories_seen"] += 1

                record, rejection = _process_advisory(advisory, seen, state)

                if record:
                    with output_path.open("a") as f:
                        f.write(json.dumps(record, separators=(",", ":")))
                        f.write("\n")
                    state["candidates_written"] += 1
                    page_candidates += 1
                elif rejection:
                    with rejected_path.open("a") as f:
                        f.write(json.dumps(rejection, separators=(",", ":")))
                        f.write("\n")

            cursor = page.next_cursor
            state["last_cursor"] = cursor
            pages_fetched += 1
            _save_checkpoint(checkpoint_path, state)

            total_dropped = sum(state["dropped"].values())
            drops = " ".join(f"{k}={v}" for k, v in sorted(state["dropped"].items()))
            print(
                f"    page {pages_fetched}: {page_candidates}/{page_size} passed | "
                f"total: {state['candidates_written']} candidates, "
                f"{total_dropped} dropped ({drops})"
            )

            if cursor is None:
                print("  Reached last page.")
                break

    _save_checkpoint(checkpoint_path, state)
    print(f"\nDone. {state['candidates_written']} candidates -> {output_path}")
    print(f"Rejections -> {rejected_path}")
    print(f"Drop breakdown: {json.dumps(state['dropped'], indent=2)}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Filter GitHub Advisory Database for ECVEBench candidates."
    )
    parser.add_argument(
        "--output", type=Path, default=DEFAULT_OUTPUT,
        help=f"Output JSONL path (default: {DEFAULT_OUTPUT}).",
    )
    parser.add_argument(
        "--rejected", type=Path, default=DEFAULT_REJECTED,
        help=f"Rejected advisories JSONL path (default: {DEFAULT_REJECTED}).",
    )
    parser.add_argument(
        "--checkpoint", type=Path, default=DEFAULT_CHECKPOINT,
        help=f"Checkpoint file path (default: {DEFAULT_CHECKPOINT}).",
    )
    parser.add_argument(
        "--max-pages", type=int, default=None,
        help="Stop after N pages (100 advisories/page). For testing.",
    )
    args = parser.parse_args(argv)

    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        print("error: GITHUB_TOKEN environment variable is required.", file=sys.stderr)
        return 1

    print("ECVEBench Advisory Filter")
    print(f"  output:     {args.output}")
    print(f"  rejected:   {args.rejected}")
    print(f"  checkpoint: {args.checkpoint}")
    if args.max_pages:
        print(f"  max-pages:  {args.max_pages}")
    print()

    run(
        token=token,
        output_path=args.output,
        rejected_path=args.rejected,
        checkpoint_path=args.checkpoint,
        max_pages=args.max_pages,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
