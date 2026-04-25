"""Environment variable helpers."""

from __future__ import annotations

import os


def require_env(name: str) -> str:
    """Return an environment variable or raise with a helpful message."""
    value = os.environ.get(name)
    if not value:
        raise SystemExit(
            f"error: {name} is not set. "
            f"Copy .env.example to .env and fill in your credentials."
        )
    return value
