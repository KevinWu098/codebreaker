"""GitHub REST API client for the ECVEBench curation pipeline.

Handles authenticated requests, cursor-based pagination for advisories,
and automatic rate-limit back-off.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import unquote

import httpx

API_BASE = "https://api.github.com"
API_VERSION = "2026-03-10"
DEFAULT_PER_PAGE = 100
RATE_LIMIT_BUFFER_SECONDS = 2


@dataclass
class AdvisoryPage:
    """A page of advisories plus the cursor for the next page."""

    advisories: list[dict[str, Any]]
    next_cursor: str | None


class GitHubClient:
    """Synchronous GitHub REST API client with rate-limit handling."""

    def __init__(self, token: str, timeout: float = 30.0) -> None:
        self._client = httpx.Client(
            base_url=API_BASE,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": API_VERSION,
            },
            timeout=timeout,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> GitHubClient:
        return self

    def __exit__(self, *args: object) -> None:
        self.close()

    def _handle_rate_limit(self, response: httpx.Response) -> None:
        remaining = response.headers.get("x-ratelimit-remaining")
        if remaining is not None and int(remaining) <= 1:
            reset_at = int(response.headers.get("x-ratelimit-reset", "0"))
            sleep_for = max(reset_at - int(time.time()), 0) + RATE_LIMIT_BUFFER_SECONDS
            print(f"  [rate-limit] sleeping {sleep_for}s until reset")
            time.sleep(sleep_for)

    def _request(
        self,
        method: str,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        max_retries: int = 3,
    ) -> httpx.Response:
        for attempt in range(max_retries):
            response = self._client.request(method, url, params=params)
            if response.status_code in (403, 429):
                retry_after = response.headers.get("retry-after")
                if retry_after:
                    sleep_for = int(retry_after) + RATE_LIMIT_BUFFER_SECONDS
                else:
                    reset_at = int(
                        response.headers.get("x-ratelimit-reset", "0")
                    )
                    sleep_for = (
                        max(reset_at - int(time.time()), 0)
                        + RATE_LIMIT_BUFFER_SECONDS
                    )
                if sleep_for <= 0:
                    sleep_for = 60 * (attempt + 1)
                print(
                    f"  [rate-limit] {response.status_code} on {url}, "
                    f"retry {attempt + 1}/{max_retries}, sleeping {sleep_for}s"
                )
                time.sleep(sleep_for)
                continue
            response.raise_for_status()
            self._handle_rate_limit(response)
            return response
        response.raise_for_status()
        return response

    @staticmethod
    def _parse_next_cursor(link_header: str | None) -> str | None:
        if not link_header:
            return None
        for part in link_header.split(","):
            if 'rel="next"' in part:
                match = re.search(r"[?&]after=([^&>]+)", part)
                if match:
                    return unquote(match.group(1))
        return None

    def list_advisories(
        self,
        *,
        after: str | None = None,
        per_page: int = DEFAULT_PER_PAGE,
    ) -> AdvisoryPage:
        """Fetch one page of reviewed security advisories."""
        params: dict[str, Any] = {
            "type": "reviewed",
            "per_page": per_page,
        }
        if after:
            params["after"] = after

        response = self._request("GET", "/advisories", params=params)
        advisories = response.json()
        next_cursor = self._parse_next_cursor(response.headers.get("link"))
        return AdvisoryPage(advisories=advisories, next_cursor=next_cursor)
