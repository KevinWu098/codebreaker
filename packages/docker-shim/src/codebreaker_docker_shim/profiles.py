import hashlib
import io
import json
import tarfile
from pathlib import Path

import docker
from docker.models.images import Image

from codebreaker_docker_shim.schemas import SandboxProfile, SandboxProfileName

_PROFILES_FILENAME = "sandbox-profiles.json"
_IMAGE_TAG_PREFIX = "codebreaker-docker-shim"


def _profile_search_paths() -> list[Path]:
    paths = [Path("/app") / _PROFILES_FILENAME]

    for parent in Path(__file__).resolve().parents:
        paths.append(parent / "packages" / "shared" / "src" / "data" / _PROFILES_FILENAME)

    return paths


def _load_profiles() -> dict[SandboxProfileName, SandboxProfile]:
    paths = _profile_search_paths()

    for path in paths:
        if path.exists():
            raw: dict[str, dict] = json.loads(path.read_text())
            return {
                name: SandboxProfile.model_validate(profile)  # type: ignore[misc]
                for name, profile in raw.items()
            }

    raise FileNotFoundError(f"Cannot find {_PROFILES_FILENAME}; searched {paths}")


PROFILES: dict[SandboxProfileName, SandboxProfile] = _load_profiles()


def resolve_profile(name: SandboxProfileName) -> SandboxProfile:
    return PROFILES[name]


def profile_fingerprint(profile: SandboxProfile) -> str:
    payload = profile.model_dump(mode="json")
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def image_tag(profile: SandboxProfile) -> str:
    return f"{_IMAGE_TAG_PREFIX}:{profile.name}-{profile_fingerprint(profile)[:12]}"


def ensure_image(client: docker.DockerClient, profile: SandboxProfile) -> Image:
    tag = image_tag(profile)

    try:
        return client.images.get(tag)
    except docker.errors.ImageNotFound:
        pass

    dockerfile = dockerfile_for_profile(profile)
    context = build_context(dockerfile)
    image, _logs = client.images.build(fileobj=context, tag=tag, rm=True)

    return image


def dockerfile_for_profile(profile: SandboxProfile) -> str:
    base_image = docker_base_image(profile.image)
    commands = [
        f"FROM {base_image}",
        "ENV DEBIAN_FRONTEND=noninteractive",
        "SHELL [\"/bin/bash\", \"-lc\"]",
    ]

    commands.extend(f"RUN {command}" for command in profile.install_commands)
    commands.append(f"RUN mkdir -p {shell_token(profile.workdir)}")
    commands.append(f"WORKDIR {profile.workdir}")

    return "\n".join(commands) + "\n"


def docker_base_image(image: str) -> str:
    if image == "debian_slim":
        return "debian:bookworm-slim"

    return image


def build_context(dockerfile: str) -> io.BytesIO:
    buffer = io.BytesIO()

    with tarfile.open(fileobj=buffer, mode="w") as archive:
        data = dockerfile.encode()
        info = tarfile.TarInfo("Dockerfile")
        info.size = len(data)
        archive.addfile(info, io.BytesIO(data))

    buffer.seek(0)
    return buffer


def shell_token(value: str) -> str:
    return json.dumps(value)
