"""Dispatch selected candidates to Devin agents for curation.

Reads the candidate JSONL produced by ``select_candidates.py``, renders
the prompt template with pre-computed fields, and creates a Devin session
for each candidate.

Prerequisites:
    Copy ``.env.example`` to ``.env`` and fill in your credentials.

Usage:

    uv run python -m pipeline.dispatch_devin --count 3
    uv run python -m pipeline.dispatch_devin --count 10 --offset 3
    uv run python -m pipeline.dispatch_devin --count 5 --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

from .lib.env import require_env

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DEVIN_API_KEY = require_env("DEVIN_API_KEY")
DEVIN_ORG_ID = require_env("DEVIN_ORG_ID")
DEVIN_USER_ID = require_env("DEVIN_USER_ID")
DEVIN_REPO = require_env("DEVIN_REPO")

BASE_URL = f"https://api.devin.ai/v3/organizations/{DEVIN_ORG_ID}/sessions"

DEFAULT_CANDIDATES = Path(__file__).resolve().parent / "output" / "candidates.jsonl"

PROMPT_TEMPLATE = (
    Path(__file__).resolve().parent.parent / "docs" / "prompts" / "curation_agent.md"
).read_text()


def render_prompt(candidate: dict[str, Any]) -> str:
    """Fill the prompt template with pre-computed candidate fields."""
    cvss = candidate.get("cvss")
    cvss_str = "null" if cvss is None else str(cvss)

    return (
        PROMPT_TEMPLATE
        .replace("{{GHSA_ID}}", candidate["ghsa_id"])
        .replace("{{VULN_CLASS}}", candidate["vuln_class"])
        .replace("{{CVSS}}", cvss_str)
        .replace("{{CVE_ID}}", candidate.get("cve_id") or "N/A")
        .replace("{{CWE_IDS}}", ", ".join(candidate.get("cwe_ids") or []))
        .replace("{{ECOSYSTEM}}", candidate.get("ecosystem") or "unknown")
    )


def dispatch_one(
    candidate: dict[str, Any],
    *,
    client: httpx.Client,
    dry_run: bool = False,
) -> dict[str, Any] | None:
    """Create a single Devin session. Returns response data or None on failure."""
    ghsa_id = candidate["ghsa_id"]
    vuln_class = candidate["vuln_class"]
    prompt = render_prompt(candidate)

    if dry_run:
        print(f"  [dry-run] {ghsa_id} ({vuln_class})")
        print(f"    cvss={candidate.get('cvss')}  eco={candidate.get('ecosystem')}  prompt={len(prompt)} chars")
        return None

    response = client.post(
        BASE_URL,
        json={
            "prompt": prompt,
            "create_as_user_id": DEVIN_USER_ID,
            "repos": [DEVIN_REPO],
            "title": f"Curate {ghsa_id} ({vuln_class})",
            "tags": ["ecvebench", "curation", ghsa_id, vuln_class],
        },
    )

    if response.is_success:
        data = response.json()
        print(f"  ok  {ghsa_id} -> {data.get('url')}")
        return data

    print(f"  ERR {ghsa_id} -> HTTP {response.status_code}: {response.text[:200]}")
    return None


def load_candidates(path: Path, offset: int, count: int) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records[offset : offset + count]


def run(
    *,
    input_path: Path,
    count: int,
    offset: int,
    dry_run: bool,
    delay: float,
) -> int:
    batch = load_candidates(input_path, offset, count)
    if not batch:
        print("No candidates to dispatch.", file=sys.stderr)
        return 1

    mode = "[dry-run] " if dry_run else ""
    print(f"{mode}Dispatching {len(batch)} candidates (offset={offset})\n")

    successes: list[dict[str, Any]] = []

    with httpx.Client(
        headers={
            "Authorization": f"Bearer {DEVIN_API_KEY}",
            "Content-Type": "application/json",
        },
        timeout=30.0,
    ) as client:
        for i, candidate in enumerate(batch):
            print(f"[{i + 1}/{len(batch)}] {candidate['ghsa_id']}")
            result = dispatch_one(candidate, client=client, dry_run=dry_run)
            if result:
                successes.append({"ghsa_id": candidate["ghsa_id"], **result})
            if not dry_run and i < len(batch) - 1:
                time.sleep(delay)

    print(f"\nDispatched: {len(successes)}/{len(batch)}")
    for s in successes:
        print(f"  {s['ghsa_id']}: {s.get('url')}")

    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Dispatch ECVEBench candidates to Devin for curation."
    )
    parser.add_argument(
        "--input", type=Path, default=DEFAULT_CANDIDATES,
        help=f"Candidates JSONL (default: {DEFAULT_CANDIDATES}).",
    )
    parser.add_argument("--count", type=int, required=True, help="Number of candidates to dispatch.")
    parser.add_argument("--offset", type=int, default=0, help="Skip first N candidates (default: 0).")
    parser.add_argument("--dry-run", action="store_true", help="Render prompts but don't call the API.")
    parser.add_argument("--delay", type=float, default=2.0, help="Seconds between API calls (default: 2).")
    args = parser.parse_args(argv)

    if not args.input.exists():
        print(f"error: candidates file not found: {args.input}", file=sys.stderr)
        return 1

    return run(
        input_path=args.input,
        count=args.count,
        offset=args.offset,
        dry_run=args.dry_run,
        delay=args.delay,
    )


if __name__ == "__main__":
    raise SystemExit(main())
