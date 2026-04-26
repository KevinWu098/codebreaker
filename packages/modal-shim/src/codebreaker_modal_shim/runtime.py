import json
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
from codebreaker_shim_shared.helpers import (
    STDIO_LIMIT_BYTES,
    cap_text,
    check_rate_limit,
    forget_sandbox,
    get_metadata,
    git_auth_args,
    last_nonempty_line,
    list_metadata,
    redact_diagnostics_for_client,
    repo_name_from_url,
    require_auth,
    resolve_workdir,
    shell_quote,
    with_idempotency as _with_idempotency,
)

SANDBOXES = modal.Dict.from_name("codebreaker-sandboxes", create_if_missing=True)
IDEMPOTENCY = modal.Dict.from_name("codebreaker-idempotency", create_if_missing=True)
RATE_LIMITS = modal.Dict.from_name("codebreaker-ratelimits", create_if_missing=True)
TIMEOUT_EXIT_CODE = 124


class ModalSandboxManager:
    def require_auth(self, request: Request) -> None:
        require_auth(request)

    def check_rate_limit(self, session_id: str) -> None:
        check_rate_limit(session_id, RATE_LIMITS)

    def cached_response(self, request: Request) -> dict[str, Any] | None:
        from codebreaker_shim_shared.helpers import cached_response as _cached_response

        return _cached_response(request, IDEMPOTENCY)

    def store_response(self, request: Request, response: dict[str, Any]) -> None:
        from codebreaker_shim_shared.helpers import store_response as _store_response

        _store_response(request, response, IDEMPOTENCY)

    def ensure_sandbox(self, session_id: str, profile_name: str) -> tuple[modal.Sandbox, SandboxMetadata]:
        profile = resolve_profile(profile_name)  # type: ignore[arg-type]
        fingerprint = profile_fingerprint(profile)
        existing = get_metadata(session_id, SANDBOXES)

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
            **({"idle_timeout": profile.idle_timeout_seconds} if profile.idle_timeout_seconds is not None else {}),
        )
        metadata = SandboxMetadata(
            created_at=time.time(),
            image_fingerprint=fingerprint,
            profile=profile.name,
            sandbox_id=sandbox.object_id,
            session_id=session_id,
        )
        SANDBOXES[session_id] = metadata.model_dump(mode="json")

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
        return get_metadata(session_id, SANDBOXES)

    def list_metadata(self) -> list[SandboxMetadata]:
        return list_metadata(SANDBOXES)

    def exec(self, request: ExecRequest) -> ExecResult:
        self.check_rate_limit(request.session_id)
        last_error: Exception | None = None

        for attempt in range(2):
            sandbox, metadata = self.ensure_sandbox(request.session_id, request.profile)
            profile = resolve_profile(metadata.profile)
            cwd = resolve_workdir(request.cwd, profile.workdir)
            timeout_seconds = request.timeout_seconds or profile.timeout_seconds
            wrapped_command = (
                f"timeout {int(timeout_seconds)}s bash -lc {shell_quote(request.command)}"
            )
            started_at = time.monotonic()

            try:
                process = sandbox.exec(
                    "bash",
                    "-lc",
                    wrapped_command,
                    workdir=cwd,
                    timeout=timeout_seconds + 2,
                )
            except modal.exception.NotFoundError as error:
                last_error = error
                forget_sandbox(request.session_id, SANDBOXES)

                if attempt == 0:
                    continue

                raise

            exit_code = process.wait()
            stdout, stdout_truncated = cap_text(
                read_stream(process.stdout), STDIO_LIMIT_BYTES
            )
            stderr, stderr_truncated = cap_text(
                read_stream(process.stderr), STDIO_LIMIT_BYTES
            )

            return ExecResult(
                command=request.command,
                duration_ms=int((time.monotonic() - started_at) * 1000),
                exit_code=int(exit_code),
                stderr=stderr,
                stderr_truncated=stderr_truncated,
                stdout=stdout,
                stdout_truncated=stdout_truncated,
                timed_out=int(exit_code) == TIMEOUT_EXIT_CODE,
            )

        raise last_error or RuntimeError("sandbox exec failed")

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
        import base64

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
        import posixpath

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
                '  if git rev-parse --verify --quiet "$checkout_ref^{commit}" >/dev/null; then',
                '    git checkout --detach "$checkout_ref"',
                "  else",
                f"    git {auth_args} fetch origin \"$checkout_ref\"",
                "    git checkout --detach FETCH_HEAD",
                "  fi",
                "  git reset --hard HEAD",
                "else",
                '  rm -rf "$repo_path"',
                f"  git {auth_args} clone --branch \"$branch\" \"$remote_url\" \"$repo_path\"",
                '  cd "$repo_path"',
                '  if git rev-parse --verify --quiet "$checkout_ref^{commit}" >/dev/null; then',
                '    git checkout --detach "$checkout_ref"',
                "  else",
                f"    git {auth_args} fetch origin \"$checkout_ref\"",
                "    git checkout --detach FETCH_HEAD",
                "  fi",
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
        metadata = get_metadata(request.session_id, SANDBOXES)

        if not metadata:
            return {"terminated": False}

        try:
            modal.Sandbox.from_id(metadata.sandbox_id).terminate()
        finally:
            forget_sandbox(request.session_id, SANDBOXES)

        return {"terminated": True}

    def forget_sandbox(self, session_id: str) -> None:
        forget_sandbox(session_id, SANDBOXES)


def with_idempotency(
    _manager: ModalSandboxManager,
    request: Request,
    operation: Callable[[], dict[str, Any]],
) -> dict[str, Any]:
    return _with_idempotency(request, operation, IDEMPOTENCY)


def read_stream(stream: Any) -> bytes:
    if hasattr(stream, "read"):
        value = stream.read()
        return value.encode() if isinstance(value, str) else bytes(value)

    return b""
