import io
import json
import tarfile

import docker
from docker.models.images import Image

from codebreaker_shim_shared.profiles import (  # noqa: F401
    PROFILES,
    profile_fingerprint,
    resolve_profile,
)
from codebreaker_shim_shared.schemas import SandboxProfile

_IMAGE_TAG_PREFIX = "codebreaker-docker-shim"


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
