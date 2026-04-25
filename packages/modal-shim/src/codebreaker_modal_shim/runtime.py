import base64
import json
import os
import posixpath
import re
import time
from collections.abc import AsyncIterator, Callable
from typing import Any

import modal
from fastapi import HTTPException, Request
from fastapi.responses import StreamingResponse

from codebreaker_modal_shim.profiles import build_image, profile_fingerprint, resolve_profile
from codebreaker_modal_shim.schemas import (
    ExecRequest,
    ExecResult,
    GitCheckoutRequest,
    GitCheckoutResponse,
    GitCommitRequest,
    GitCommitResponse,
    ReadRequest,
    ReadResponse,
    SandboxMetadata,
    TerminateRequest,
    WriteRequest,
    WriteResponse,
)

STDIO_LIMIT_BYTES = 256 * 1024
IDEMPOTENCY_TTL_SECONDS = 15 * 60
RATE_LIMIT_WINDOW_SECONDS = 60
RATE_LIMIT_REQUESTS = 60

SANDBOXES = modal.Dict.from_name("codebreaker-sandboxes", create_if_missing=True)
IDEMPOTENCY = modal.Dict.from_name("codebreaker-idempotency", create_if_missing=True)
RATE_LIMITS = modal.Dict.from_name("codebreaker-ratelimits", create_if_missing=True)

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


class ModalSandboxManager:
    def require_auth(self, request: Request) -> None:
        expected_secret = os.environ.get("SHIM_SECRET")

        if not expected_secret:
            raise HTTPException(status_code=500, detail="SHIM_SECRET is not configured")

        if request.headers.get("X-Shim-Secret") != expected_secret:
            raise HTTPException(status_code=401, detail="Invalid shim secret")

    def check_rate_limit(self, session_id: str) -> None:
        now = time.time()
        timestamps = [
            timestamp
            for timestamp in RATE_LIMITS.get(session_id, [])
            if now - float(timestamp) < RATE_LIMIT_WINDOW_SECONDS
        ]

        if len(timestamps) >= RATE_LIMIT_REQUESTS:
            raise HTTPException(
                headers={"Retry-After": str(RATE_LIMIT_WINDOW_SECONDS)},
                status_code=429,
                detail="Rate limit exceeded",
            )

        RATE_LIMITS[session_id] = [*timestamps, now]

    def cached_response(self, request: Request) -> dict[str, Any] | None:
        key = request.headers.get("X-Idempotency-Key")

        if not key:
            return None

        cached = IDEMPOTENCY.get(key)

        if not cached:
            return None

        if float(cached["expires_at"]) < time.time():
            del IDEMPOTENCY[key]
            return None

        return dict(cached["response"])

    def store_response(self, request: Request, response: dict[str, Any]) -> None:
        key = request.headers.get("X-Idempotency-Key")

        if not key:
            return

        IDEMPOTENCY[key] = {
            "expires_at": time.time() + IDEMPOTENCY_TTL_SECONDS,
            "response": response,
        }

    def ensure_sandbox(self, session_id: str, profile_name: str) -> tuple[modal.Sandbox, SandboxMetadata]:
        profile = resolve_profile(profile_name)  # type: ignore[arg-type]
        fingerprint = profile_fingerprint(profile)
        existing = self.get_metadata(session_id)

        if existing and existing.image_fingerprint == fingerprint:
            return modal.Sandbox.from_id(existing.sandbox_id), existing

        if existing:
            self.terminate(TerminateRequest(session_id=session_id))

        sandbox = modal.Sandbox.create(
            "sleep",
            "infinity",
            app=modal.App.lookup("codebreaker-modal-shim", create_if_missing=True),
            cpu=profile.cpu,
            encrypted_ports=profile.encrypted_ports,
            env=profile.env,
            image=build_image(profile),
            memory=profile.memory_mb,
            timeout=profile.timeout_seconds,
            **({"idle_timeout": profile.idle_timeout_seconds} if profile.idle_timeout_seconds else {}),
        )
        metadata = SandboxMetadata(
            created_at=time.time(),
            image_fingerprint=fingerprint,
            profile=profile.name,
            sandbox_id=sandbox.object_id,
            session_id=session_id,
        )
        SANDBOXES[session_id] = metadata.model_dump(mode="json")

        # New sandboxes have no /workspace yet. Modal needs an existing workdir
        # before the process starts, so bootstrap mkdir from a path that always
        # exists in the image (see checkout_git_repo -> exec with default cwd).
        self.exec(
            ExecRequest(
                command=f"mkdir -p {shell_quote(profile.workdir)}",
                cwd="/",
                profile=profile.name,
                session_id=session_id,
            )
        )

        return sandbox, metadata

    def get_metadata(self, session_id: str) -> SandboxMetadata | None:
        metadata = SANDBOXES.get(session_id)

        return SandboxMetadata.model_validate(metadata) if metadata else None

    def list_metadata(self) -> list[SandboxMetadata]:
        return [
            SandboxMetadata.model_validate(metadata)
            for metadata in SANDBOXES.values()
        ]

    def exec(self, request: ExecRequest) -> ExecResult:
        self.check_rate_limit(request.session_id)
        sandbox, metadata = self.ensure_sandbox(request.session_id, request.profile)
        profile = resolve_profile(metadata.profile)
        cwd = resolve_workdir(request.cwd, profile.workdir)
        timeout_seconds = request.timeout_seconds or profile.timeout_seconds
        started_at = time.monotonic()
        process = sandbox.exec(
            "bash",
            "-lc",
            request.command,
            workdir=cwd,
            timeout=timeout_seconds,
        )
        exit_code = process.wait()
        stdout, stdout_truncated = cap_text(read_stream(process.stdout), STDIO_LIMIT_BYTES)
        stderr, stderr_truncated = cap_text(read_stream(process.stderr), STDIO_LIMIT_BYTES)

        return ExecResult(
            command=request.command,
            duration_ms=int((time.monotonic() - started_at) * 1000),
            exit_code=int(exit_code),
            stderr=stderr,
            stderr_truncated=stderr_truncated,
            stdout=stdout,
            stdout_truncated=stdout_truncated,
        )

    def exec_stream(self, request: ExecRequest) -> StreamingResponse:
        async def stream() -> AsyncIterator[str]:
            result = self.exec(request)
            yield json.dumps({"type": "result", "result": result.model_dump(mode="json")})
            yield "\n"

        return StreamingResponse(stream(), media_type="application/x-ndjson")

    def read_file(self, request: ReadRequest) -> ReadResponse:
        command = "\n".join(
            [
                "python3 - <<'PY'",
                "import base64",
                f"path = {json.dumps(request.path)}",
                "with open(path, 'rb') as file:",
                "    print(base64.b64encode(file.read()).decode())",
                "PY",
            ]
        )
        result = self.exec(
            ExecRequest(
                command=command,
                profile=request.profile,
                session_id=request.session_id,
            )
        )

        if result.exit_code != 0:
            raise HTTPException(
                status_code=500, detail=redact_diagnostics_for_client(result.stderr)
            )

        return ReadResponse(
            content_base64=result.stdout.strip(),
            path=request.path,
        )

    def write_file(self, request: WriteRequest) -> WriteResponse:
        content = base64.b64decode(request.content_base64)
        command = "\n".join(
            [
                "python3 - <<'PY'",
                "import base64",
                f"path = {json.dumps(request.path)}",
                f"content = {json.dumps(request.content_base64)}",
                "with open(path, 'wb') as file:",
                "    file.write(base64.b64decode(content))",
                "PY",
            ]
        )
        result = self.exec(
            ExecRequest(
                command=command,
                profile=request.profile,
                session_id=request.session_id,
            )
        )

        if result.exit_code != 0:
            raise HTTPException(
                status_code=500, detail=redact_diagnostics_for_client(result.stderr)
            )

        return WriteResponse(bytes_written=len(content), path=request.path)

    def checkout_git_repo(self, request: GitCheckoutRequest) -> GitCheckoutResponse:
        profile = resolve_profile(request.profile)
        repo_path = (
            resolve_workdir(request.path, profile.workdir)
            if request.path
            else posixpath.join(profile.workdir, repo_name_from_url(request.remote_url))
        )
        auth_args = git_auth_args(request)
        command = "\n".join(
            [
                "set -euo pipefail",
                f"repo_path={shell_quote(repo_path)}",
                f"remote_url={shell_quote(request.remote_url)}",
                f"branch={shell_quote(request.branch)}",
                f"checkout_ref={shell_quote(request.ref or request.branch)}",
                'mkdir -p "$(dirname "$repo_path")"',
                'if [ -d "$repo_path/.git" ]; then',
                '  cd "$repo_path"',
                '  git remote set-url origin "$remote_url"',
                f"  git {auth_args} fetch origin \"$branch\"",
                f"  git {auth_args} fetch origin \"$checkout_ref\" || true",
                '  git checkout --detach "$checkout_ref"',
                '  git reset --hard "$checkout_ref"',
                "else",
                '  rm -rf "$repo_path"',
                f"  git {auth_args} clone --branch \"$branch\" \"$remote_url\" \"$repo_path\"",
                '  cd "$repo_path"',
                f"  git {auth_args} fetch origin \"$checkout_ref\" || true",
                '  git checkout --detach "$checkout_ref"',
                "fi",
                "git rev-parse HEAD",
            ]
        )
        result = self.exec(
            ExecRequest(
                command=command,
                profile=request.profile,
                session_id=request.session_id,
            )
        )

        if result.exit_code != 0:
            raise HTTPException(
                status_code=500, detail=redact_diagnostics_for_client(result.stderr)
            )

        return GitCheckoutResponse(
            commit_sha=last_nonempty_line(result.stdout),
            repo_path=repo_path,
        )

    def commit_git_repo(self, request: GitCommitRequest) -> GitCommitResponse:
        auth_args = git_auth_args(request)
        add_paths = " ".join(shell_quote(path) for path in request.paths)
        command = "\n".join(
            [
                "set -euo pipefail",
                f"repo_path={shell_quote(request.path)}",
                f"remote_url={shell_quote(request.remote_url)}",
                f"branch={shell_quote(request.branch)}",
                f"message={shell_quote(request.message)}",
                'cd "$repo_path"',
                'git remote set-url origin "$remote_url"',
                f"git add -- {add_paths}",
                "if git diff --cached --quiet; then",
                "  echo __NO_CHANGES__",
                "  git rev-parse HEAD",
                "  exit 0",
                "fi",
                'git -c user.name="Codebreaker" -c user.email="codebreaker@example.invalid" commit -m "$message"',
                f"git {auth_args} push origin HEAD:\"$branch\"",
                "git rev-parse HEAD",
            ]
        )
        result = self.exec(
            ExecRequest(
                command=command,
                profile=request.profile,
                session_id=request.session_id,
            )
        )

        if result.exit_code != 0:
            raise HTTPException(
                status_code=500, detail=redact_diagnostics_for_client(result.stderr)
            )

        return GitCommitResponse(
            commit_sha=last_nonempty_line(result.stdout),
            pushed="__NO_CHANGES__" not in result.stdout,
            repo_path=request.path,
        )

    def terminate(self, request: TerminateRequest) -> dict[str, bool]:
        metadata = self.get_metadata(request.session_id)

        if not metadata:
            return {"terminated": False}

        try:
            modal.Sandbox.from_id(metadata.sandbox_id).terminate()
        finally:
            del SANDBOXES[request.session_id]

        return {"terminated": True}


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


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


def read_stream(stream: Any) -> bytes:
    if hasattr(stream, "read"):
        value = stream.read()
        return value.encode() if isinstance(value, str) else bytes(value)

    return b""


def cap_text(value: bytes, limit: int) -> tuple[str, bool]:
    truncated = len(value) > limit
    return value[:limit].decode(errors="replace"), truncated


def with_idempotency(
    manager: ModalSandboxManager,
    request: Request,
    operation: Callable[[], dict[str, Any]],
) -> dict[str, Any]:
    cached = manager.cached_response(request)

    if cached is not None:
        return cached

    response = operation()
    manager.store_response(request, response)

    return response
