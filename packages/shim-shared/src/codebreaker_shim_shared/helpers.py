import base64
import os
import posixpath
import re
import shlex
import time
from collections.abc import Callable
from typing import Any

from fastapi import HTTPException, Request

from codebreaker_shim_shared.schemas import (
    GitCheckoutRequest,
    GitCommitRequest,
    SandboxMetadata,
)

STDIO_LIMIT_BYTES = 256 * 1024
IDEMPOTENCY_TTL_SECONDS = 15 * 60
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_REQUESTS = 60

_REDACT_AUTH_BASIC = re.compile(
    r"Authorization:\s*Basic\s+[A-Za-z0-9+/=]+", re.IGNORECASE
)
_REDACT_AUTH_BEARER = re.compile(
    r"Authorization:\s*Bearer\s+[^\s'\"`]+", re.IGNORECASE
)


def redact_diagnostics_for_client(message: str) -> str:
    """
    Error strings can embed the full git command line, including
    `http.extraHeader=... Authorization: Basic <base64(user:token)>` which must
    never be returned in API responses or stored downstream.
    """
    if not message:
        return message

    out = _REDACT_AUTH_BASIC.sub("Authorization: Basic <redacted>", message)
    return _REDACT_AUTH_BEARER.sub("Authorization: Bearer <redacted>", out)


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def git_auth_args(request: GitCheckoutRequest | GitCommitRequest) -> str:
    if request.credential.type == "token-header":
        header = f"Authorization: Bearer {request.credential.password}"
    else:
        encoded = base64.b64encode(
            f"{request.credential.username}:{request.credential.password}".encode()
        ).decode()
        header = f"Authorization: Basic {encoded}"

    return f"-c http.extraHeader={shell_quote(header)}"


def repo_name_from_url(remote_url: str) -> str:
    name = remote_url.rstrip("/").rsplit("/", maxsplit=1)[-1]

    if name.endswith(".git"):
        name = name[:-4]

    return name or "repo"


def last_nonempty_line(value: str) -> str | None:
    for line in reversed(value.splitlines()):
        stripped = line.strip()

        if stripped:
            return stripped

    return None


def resolve_workdir(cwd: str | None, default_workdir: str) -> str:
    if not cwd:
        return default_workdir

    if posixpath.isabs(cwd):
        return posixpath.normpath(cwd)

    return posixpath.normpath(posixpath.join(default_workdir, cwd))


def cap_text(value: bytes, limit: int) -> tuple[str, bool]:
    truncated = len(value) > limit
    return value[:limit].decode(errors="replace"), truncated


def require_auth(request: Request) -> None:
    expected_secret = os.environ.get("SHIM_SECRET")

    if not expected_secret:
        raise HTTPException(status_code=500, detail="SHIM_SECRET is not configured")

    if request.headers.get("X-Shim-Secret") != expected_secret:
        raise HTTPException(status_code=401, detail="Invalid shim secret")


def check_rate_limit(
    session_id: str,
    rate_limits: dict[str, list[float]],
) -> None:
    now = time.time()
    timestamps = [
        timestamp
        for timestamp in rate_limits.get(session_id, [])
        if now - float(timestamp) < RATE_LIMIT_WINDOW_SECONDS
    ]

    if len(timestamps) >= RATE_LIMIT_REQUESTS:
        raise HTTPException(
            headers={"Retry-After": str(RATE_LIMIT_WINDOW_SECONDS)},
            status_code=429,
            detail="Rate limit exceeded",
        )

    rate_limits[session_id] = [*timestamps, now]


def cached_response(
    request: Request,
    idempotency_store: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    key = request.headers.get("X-Idempotency-Key")

    if not key:
        return None

    cached = idempotency_store.get(key)

    if not cached:
        return None

    if float(cached["expires_at"]) < time.time():
        del idempotency_store[key]
        return None

    return dict(cached["response"])


def store_response(
    request: Request,
    response: dict[str, Any],
    idempotency_store: dict[str, dict[str, Any]],
) -> None:
    key = request.headers.get("X-Idempotency-Key")

    if not key:
        return

    idempotency_store[key] = {
        "expires_at": time.time() + IDEMPOTENCY_TTL_SECONDS,
        "response": response,
    }


def get_metadata(
    session_id: str,
    sandbox_store: dict[str, dict[str, Any]],
) -> SandboxMetadata | None:
    metadata = sandbox_store.get(session_id)

    if not metadata:
        return None

    return SandboxMetadata.model_validate(metadata)


def list_metadata(
    sandbox_store: dict[str, dict[str, Any]],
) -> list[SandboxMetadata]:
    return [
        SandboxMetadata.model_validate(metadata)
        for metadata in sandbox_store.values()
    ]


def forget_sandbox(
    session_id: str,
    sandbox_store: dict[str, dict[str, Any]],
) -> None:
    if get_metadata(session_id, sandbox_store):
        del sandbox_store[session_id]


def with_idempotency(
    request: Request,
    operation: Callable[[], dict[str, Any]],
    idempotency_store: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    cached = cached_response(request, idempotency_store)

    if cached is not None:
        return cached

    response = operation()
    store_response(request, response, idempotency_store)

    return response
