"""Terminate completed Devin curation sessions to free up concurrency slots.

Lists all sessions tagged with 'curation', finds ones that are finished
or suspended due to inactivity, and terminates them (with archive=true
so they remain accessible for reference).

Usage:

    uv run python -m pipeline.cleanup_sessions
    uv run python -m pipeline.cleanup_sessions --dry-run
    uv run python -m pipeline.cleanup_sessions --status   # just show counts
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

from .lib.env import require_env

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DEVIN_API_KEY = require_env("DEVIN_API_KEY")
DEVIN_ORG_ID = require_env("DEVIN_ORG_ID")

BASE_URL = f"https://api.devin.ai/v3/organizations/{DEVIN_ORG_ID}/sessions"

TERMINABLE = {
    ("running", "finished"),
    ("suspended", "inactivity"),
    ("suspended", "user_request"),
}


MAX_RETRIES = 3
RETRY_BACKOFF = 5.0

TIMEOUT = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)


def _client() -> httpx.Client:
    return httpx.Client(
        headers={
            "Authorization": f"Bearer {DEVIN_API_KEY}",
            "Content-Type": "application/json",
        },
        timeout=TIMEOUT,
    )


def _request_with_retry(
    method: str,
    client: httpx.Client,
    url: str,
    *,
    params: dict | None = None,
) -> httpx.Response:
    """Fire an HTTP request with retries on transient errors."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = client.request(method, url, params=params)
            return resp
        except (httpx.ReadTimeout, httpx.ConnectTimeout, httpx.RemoteProtocolError) as exc:
            if attempt == MAX_RETRIES:
                raise
            wait = RETRY_BACKOFF * attempt
            print(f"    retry {attempt}/{MAX_RETRIES} after {type(exc).__name__}, waiting {wait:.0f}s...")
            time.sleep(wait)
    raise RuntimeError("unreachable")


def list_curation_sessions(client: httpx.Client) -> list[dict]:
    """Paginate through all curation-tagged sessions (v3 cursor pagination)."""
    sessions: list[dict] = []
    cursor: str | None = None
    while True:
        params: dict = {"tags": "curation", "first": 200}
        if cursor:
            params["after"] = cursor
        resp = _request_with_retry("GET", client, BASE_URL, params=params)
        resp.raise_for_status()
        data = resp.json()
        items = data.get("items", [])
        sessions.extend(items)
        if not data.get("has_next_page") or not items:
            break
        cursor = data.get("end_cursor")
        if not cursor:
            break
    return sessions


def terminate_session(client: httpx.Client, devin_id: str) -> bool:
    try:
        resp = _request_with_retry(
            "DELETE", client, f"{BASE_URL}/{devin_id}", params={"archive": "true"},
        )
        return resp.is_success
    except (httpx.ReadTimeout, httpx.ConnectTimeout):
        return False


def run(*, dry_run: bool = False, status_only: bool = False, filter_states: set[tuple[str, str]] | None = None) -> int:
    target_states = filter_states or TERMINABLE
    with _client() as client:
        print("Fetching curation sessions...")
        sessions = list_curation_sessions(client)
        print(f"Found {len(sessions)} curation sessions total\n")

        by_state: dict[str, list[dict]] = {}
        for s in sessions:
            key = f"{s.get('status', '?')}/{s.get('status_detail', '?')}"
            by_state.setdefault(key, []).append(s)

        print("Session breakdown:")
        for state in sorted(by_state):
            print(f"  {state:45s} {len(by_state[state]):>4d}")

        to_terminate = [
            s for s in sessions
            if (s.get("status"), s.get("status_detail")) in target_states
        ]
        label = ", ".join(f"{s}/{d}" for s, d in sorted(target_states))
        print(f"\nTargeting ({label}): {len(to_terminate)}")

        if status_only or not to_terminate:
            return 0

        if dry_run:
            print("\n[dry-run] Would terminate:")
            for s in to_terminate:
                sid = s.get("session_id", "?")
                print(f"  {sid}  {s.get('title', '?')}")
            return 0

        terminated = 0
        failed = 0
        for i, s in enumerate(to_terminate):
            sid = s.get("session_id", "?")
            title = s.get("title", "?")
            print(f"  [{i + 1}/{len(to_terminate)}] {sid}  {title}  ", end="", flush=True)
            if terminate_session(client, sid):
                print("ok")
                terminated += 1
            else:
                print("FAILED")
                failed += 1
            time.sleep(0.5)

        print(f"\nTerminated {terminated}/{len(to_terminate)} sessions ({failed} failed)")

    return 0


def poll(*, interval: int = 120) -> int:
    """Run cleanup in a loop, checking every `interval` seconds."""
    print(f"Polling for finished sessions every {interval}s (Ctrl-C to stop)\n")
    while True:
        try:
            run()
            print(f"\nSleeping {interval}s...\n{'—' * 50}\n")
            time.sleep(interval)
        except KeyboardInterrupt:
            print("\nStopped.")
            return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Terminate completed Devin curation sessions."
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="List terminable sessions without actually terminating.",
    )
    parser.add_argument(
        "--status", action="store_true",
        help="Just show session state counts, don't terminate anything.",
    )
    parser.add_argument(
        "--poll", type=int, nargs="?", const=120, default=None, metavar="SECS",
        help="Run in a loop, cleaning up every N seconds (default: 120).",
    )
    parser.add_argument(
        "--filter", type=str, action="append", metavar="STATUS/DETAIL",
        help=(
            "Only terminate sessions matching this state (e.g. 'running/waiting_for_user'). "
            "Can be specified multiple times. Default: finished + inactive + user_request."
        ),
    )
    args = parser.parse_args(argv)

    filter_states: set[tuple[str, str]] | None = None
    if args.filter:
        filter_states = set()
        for f in args.filter:
            parts = f.split("/", 1)
            if len(parts) != 2:
                parser.error(f"--filter must be 'status/detail', got: {f}")
            filter_states.add((parts[0], parts[1]))

    if args.poll is not None:
        return poll(interval=args.poll)

    return run(dry_run=args.dry_run, status_only=args.status, filter_states=filter_states)


if __name__ == "__main__":
    raise SystemExit(main())
