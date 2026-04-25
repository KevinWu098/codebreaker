from pathlib import Path

import modal
from fastapi import Depends, FastAPI, Request

from codebreaker_modal_shim.runtime import ModalSandboxManager, with_idempotency
from codebreaker_modal_shim.schemas import (
    ExecRequest,
    GitCheckoutRequest,
    GitCommitRequest,
    ReadRequest,
    SnapshotRequest,
    SnapshotResponse,
    TerminateRequest,
    WriteRequest,
)

_PROFILES_FILENAME = "sandbox-profiles.json"


def _find_profiles_json() -> Path:
    deployed_path = Path("/app") / _PROFILES_FILENAME

    if deployed_path.exists():
        return deployed_path

    for parent in Path(__file__).resolve().parents:
        path = parent / "packages" / "shared" / "src" / "data" / _PROFILES_FILENAME

        if path.exists():
            return path

    raise FileNotFoundError(f"Cannot find {_PROFILES_FILENAME}")


_PROFILES_JSON = _find_profiles_json()

app = modal.App("codebreaker-modal-shim")
image = modal.Image.debian_slim().apt_install("git").pip_install(
    "fastapi>=0.115.0",
    "pydantic>=2.9.2",
).add_local_python_source(
    "codebreaker_shim_shared",
).add_local_python_source(
    "codebreaker_modal_shim",
).add_local_file(
    str(_PROFILES_JSON), remote_path="/app/sandbox-profiles.json",
)


def create_fastapi_app() -> FastAPI:
    api = FastAPI(title="Codebreaker Modal Shim")
    manager = ModalSandboxManager()

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
    def exec_stream(payload: ExecRequest):
        return manager.exec_stream(payload)

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


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("codebreaker-shim")],
)
@modal.asgi_app()
def fastapi_app() -> FastAPI:
    return create_fastapi_app()
