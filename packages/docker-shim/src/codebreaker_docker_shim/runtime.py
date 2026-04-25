import base64
import hashlib
import io
import posixpath
import tarfile
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import docker
from docker.models.containers import Container
from fastapi import HTTPException, Request

from codebreaker_docker_shim.profiles import (
    ensure_image,
    image_tag,
    profile_fingerprint,
    resolve_profile,
)
from codebreaker_docker_shim.schemas import (
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

TIMEOUT_EXIT_CODE = 124

SANDBOXES: dict[str, dict[str, Any]] = {}
IDEMPOTENCY: dict[str, dict[str, Any]] = {}
RATE_LIMITS: dict[str, list[float]] = {}


@dataclass(frozen=True)
class RawExecResult:
    duration_ms: int
    exit_code: int
    stderr: bytes
    stdout: bytes
    timed_out: bool


class DockerSandboxManager:
    def __init__(self) -> None:
        self.client = docker.from_env()

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

    def ensure_sandbox(
        self, session_id: str, profile_name: str
    ) -> tuple[Container, SandboxMetadata]:
        profile = resolve_profile(profile_name)  # type: ignore[arg-type]
        fingerprint = profile_fingerprint(profile)
        existing = get_metadata(session_id, SANDBOXES)

        if existing and existing.image_fingerprint == fingerprint:
            try:
                container = self.client.containers.get(existing.sandbox_id)
                container.reload()

                if container.status != "running":
                    container.start()

                return container, existing
            except docker.errors.NotFound:
                forget_sandbox(session_id, SANDBOXES)

        if existing:
            self.terminate(TerminateRequest(session_id=session_id))

        ensure_image(self.client, profile)
        container = self.client.containers.run(
            image_tag(profile),
            command=["sleep", "infinity"],
            detach=True,
            environment=profile.env,
            labels={
                "codebreaker.session_id": session_id,
                "codebreaker.sandbox": "true",
            },
            mem_limit=f"{profile.memory_mb}m",
            name=container_name(session_id),
            nano_cpus=int(profile.cpu * 1_000_000_000),
            working_dir=profile.workdir,
        )
        metadata = SandboxMetadata(
            created_at=time.time(),
            image_fingerprint=fingerprint,
            profile=profile.name,
            sandbox_id=container.id,
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

        return container, metadata

    def get_metadata(self, session_id: str) -> SandboxMetadata | None:
        return get_metadata(session_id, SANDBOXES)

    def list_metadata(self) -> list[SandboxMetadata]:
        return list_metadata(SANDBOXES)

    def exec(self, request: ExecRequest) -> ExecResult:
        self.check_rate_limit(request.session_id)
        container, metadata = self.ensure_sandbox(request.session_id, request.profile)
        profile = resolve_profile(metadata.profile)
        cwd = resolve_workdir(request.cwd, profile.workdir)
        timeout_seconds = request.timeout_seconds or profile.timeout_seconds
        result = self.exec_raw(container, request.command, cwd, timeout_seconds)
        stdout, stdout_truncated = cap_text(result.stdout, STDIO_LIMIT_BYTES)
        stderr, stderr_truncated = cap_text(result.stderr, STDIO_LIMIT_BYTES)

        return ExecResult(
            command=request.command,
            duration_ms=result.duration_ms,
            exit_code=result.exit_code,
            stderr=stderr,
            stderr_truncated=stderr_truncated,
            stdout=stdout,
            stdout_truncated=stdout_truncated,
            timed_out=result.timed_out,
        )

    def exec_raw(
        self,
        container: Container,
        command: str,
        cwd: str,
        timeout_seconds: int,
    ) -> RawExecResult:
        started_at = time.monotonic()
        wrapped_command = f"timeout {int(timeout_seconds)}s bash -lc {shell_quote(command)}"
        exit_code, output = container.exec_run(
            ["bash", "-lc", wrapped_command],
            demux=True,
            workdir=cwd,
        )
        stdout, stderr = normalize_exec_output(output)

        return RawExecResult(
            duration_ms=int((time.monotonic() - started_at) * 1000),
            exit_code=int(exit_code),
            stderr=stderr,
            stdout=stdout,
            timed_out=int(exit_code) == TIMEOUT_EXIT_CODE,
        )

    def read_file(self, request: ReadRequest) -> ReadResponse:
        self.check_rate_limit(request.session_id)
        container, metadata = self.ensure_sandbox(request.session_id, request.profile)
        profile = resolve_profile(metadata.profile)
        path = resolve_workdir(request.path, profile.workdir)

        try:
            content = read_container_file(container, path)
        except Exception as error:
            raise HTTPException(
                status_code=500,
                detail=redact_diagnostics_for_client(str(error)),
            ) from error

        return ReadResponse(
            content_base64=base64.b64encode(content).decode(),
            path=request.path,
        )

    def write_file(self, request: WriteRequest) -> WriteResponse:
        self.check_rate_limit(request.session_id)
        container, metadata = self.ensure_sandbox(request.session_id, request.profile)
        profile = resolve_profile(metadata.profile)
        path = resolve_workdir(request.path, profile.workdir)
        content = base64.b64decode(request.content_base64)

        try:
            write_container_file(container, path, content)
        except Exception as error:
            raise HTTPException(
                status_code=500,
                detail=redact_diagnostics_for_client(str(error)),
            ) from error

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
                "git -c user.name=\"Codebreaker\" "
                '-c user.email="codebreaker@example.invalid" commit -m "$message"',
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
            container = self.client.containers.get(metadata.sandbox_id)
            container.remove(force=True)
        except docker.errors.NotFound:
            pass
        finally:
            forget_sandbox(request.session_id, SANDBOXES)

        return {"terminated": True}

    def forget_sandbox(self, session_id: str) -> None:
        forget_sandbox(session_id, SANDBOXES)


def with_idempotency(
    _manager: DockerSandboxManager,
    request: Request,
    operation: Callable[[], dict[str, Any]],
) -> dict[str, Any]:
    return _with_idempotency(request, operation, IDEMPOTENCY)


def container_name(session_id: str) -> str:
    digest = hashlib.sha256(session_id.encode()).hexdigest()[:16]
    return f"codebreaker-sandbox-{digest}"


def read_container_file(container: Container, path: str) -> bytes:
    stream, _stat = container.get_archive(path)
    archive_bytes = b"".join(stream)

    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r") as archive:
        members = [member for member in archive.getmembers() if member.isfile()]

        if not members:
            raise FileNotFoundError(f"{path} is not a file")

        file = archive.extractfile(members[0])

        if file is None:
            raise FileNotFoundError(f"{path} could not be read")

        return file.read()


def write_container_file(container: Container, path: str, content: bytes) -> None:
    parent = posixpath.dirname(path) or "/"
    filename = posixpath.basename(path)
    mkdir_result = container.exec_run(["mkdir", "-p", parent])

    if int(mkdir_result.exit_code) != 0:
        raise RuntimeError(read_exec_run_output(mkdir_result.output))

    buffer = io.BytesIO()

    with tarfile.open(fileobj=buffer, mode="w") as archive:
        info = tarfile.TarInfo(filename)
        info.size = len(content)
        archive.addfile(info, io.BytesIO(content))

    buffer.seek(0)
    container.put_archive(parent, buffer.getvalue())


def normalize_exec_output(output: Any) -> tuple[bytes, bytes]:
    if isinstance(output, tuple):
        stdout, stderr = output
        return bytes(stdout or b""), bytes(stderr or b"")

    if isinstance(output, bytes):
        return output, b""

    return b"", b""


def read_exec_run_output(output: Any) -> str:
    if isinstance(output, bytes):
        return output.decode(errors="replace")

    return str(output)
