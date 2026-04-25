from typing import Literal

from pydantic import BaseModel, Field

SandboxProfileName = Literal["python", "node", "recon"]


class SandboxProfile(BaseModel):
    name: SandboxProfileName
    image: str
    install_commands: list[str] = Field(default_factory=list)
    workdir: str = "/workspace"
    env: dict[str, str] = Field(default_factory=dict)
    cpu: float = 1
    memory_mb: int = 1024
    timeout_seconds: int = 300
    encrypted_ports: list[int] = Field(default_factory=list)


class ExecRequest(BaseModel):
    session_id: str = Field(min_length=1)
    command: str = Field(min_length=1)
    cwd: str | None = None
    profile: SandboxProfileName = "python"
    timeout_seconds: int | None = Field(default=None, gt=0)


class ExecResult(BaseModel):
    command: str
    duration_ms: int = Field(ge=0)
    exit_code: int
    stdout: str
    stderr: str
    stdout_truncated: bool = False
    stderr_truncated: bool = False
    timed_out: bool = False


class ReadRequest(BaseModel):
    session_id: str = Field(min_length=1)
    path: str = Field(min_length=1)
    profile: SandboxProfileName = "python"


class ReadResponse(BaseModel):
    content_base64: str
    path: str


class WriteRequest(BaseModel):
    session_id: str = Field(min_length=1)
    path: str = Field(min_length=1)
    content_base64: str
    profile: SandboxProfileName = "python"


class WriteResponse(BaseModel):
    bytes_written: int = Field(ge=0)
    path: str


class TerminateRequest(BaseModel):
    session_id: str = Field(min_length=1)


class SnapshotRequest(BaseModel):
    session_id: str = Field(min_length=1)


class SnapshotResponse(BaseModel):
    snapshot_id: str | None = None
    supported: bool = False


class SandboxMetadata(BaseModel):
    created_at: float
    image_fingerprint: str
    profile: SandboxProfileName
    sandbox_id: str
    session_id: str
    snapshot_id: str | None = None


class ErrorResponse(BaseModel):
    code: str
    message: str
