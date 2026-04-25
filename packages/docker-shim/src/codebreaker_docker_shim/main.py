import json
from collections.abc import Iterator

from fastapi import Depends, FastAPI, Request
from fastapi.responses import StreamingResponse

from codebreaker_docker_shim.runtime import DockerSandboxManager, with_idempotency
from codebreaker_docker_shim.schemas import (
    ExecRequest,
    GitCheckoutRequest,
    GitCommitRequest,
    ReadRequest,
    SnapshotRequest,
    SnapshotResponse,
    TerminateRequest,
    WriteRequest,
)


def create_fastapi_app() -> FastAPI:
    api = FastAPI(title="Codebreaker Docker Shim")
    manager = DockerSandboxManager()

    def require_auth(request: Request) -> None:
        manager.require_auth(request)

    @api.get("/health")
    def health() -> dict[str, bool]:
        return {"ok": True}

    @api.post("/exec", dependencies=[Depends(require_auth)])
    def exec_command(request: Request, payload: ExecRequest) -> dict:
        return with_idempotency(
            manager,
            request,
            lambda: manager.exec(payload).model_dump(mode="json"),
        )

    @api.post("/exec/stream", dependencies=[Depends(require_auth)])
    def exec_stream(payload: ExecRequest) -> StreamingResponse:
        def stream() -> Iterator[str]:
            result = manager.exec(payload)
            yield json.dumps({"type": "result", "result": result.model_dump(mode="json")})
            yield "\n"

        return StreamingResponse(stream(), media_type="application/x-ndjson")

    @api.post("/read", dependencies=[Depends(require_auth)])
    def read_file(request: Request, payload: ReadRequest) -> dict:
        return with_idempotency(
            manager,
            request,
            lambda: manager.read_file(payload).model_dump(mode="json"),
        )

    @api.post("/write", dependencies=[Depends(require_auth)])
    def write_file(request: Request, payload: WriteRequest) -> dict:
        return with_idempotency(
            manager,
            request,
            lambda: manager.write_file(payload).model_dump(mode="json"),
        )

    @api.post("/git/checkout", dependencies=[Depends(require_auth)])
    def checkout_git_repo(request: Request, payload: GitCheckoutRequest) -> dict:
        return with_idempotency(
            manager,
            request,
            lambda: manager.checkout_git_repo(payload).model_dump(mode="json"),
        )

    @api.post("/git/commit", dependencies=[Depends(require_auth)])
    def commit_git_repo(request: Request, payload: GitCommitRequest) -> dict:
        return with_idempotency(
            manager,
            request,
            lambda: manager.commit_git_repo(payload).model_dump(mode="json"),
        )

    @api.post("/terminate", dependencies=[Depends(require_auth)])
    def terminate(request: Request, payload: TerminateRequest) -> dict:
        return with_idempotency(
            manager,
            request,
            lambda: manager.terminate(payload),
        )

    @api.post("/snapshot", dependencies=[Depends(require_auth)])
    def snapshot(payload: SnapshotRequest) -> dict:
        manager.check_rate_limit(payload.session_id)
        return SnapshotResponse().model_dump(mode="json")

    @api.get("/sandboxes", dependencies=[Depends(require_auth)])
    def list_sandboxes() -> list[dict]:
        return [
            metadata.model_dump(mode="json")
            for metadata in manager.list_metadata()
        ]

    @api.get("/sandboxes/{session_id}", dependencies=[Depends(require_auth)])
    def get_sandbox(session_id: str) -> dict | None:
        metadata = manager.get_metadata(session_id)
        return metadata.model_dump(mode="json") if metadata else None

    return api
