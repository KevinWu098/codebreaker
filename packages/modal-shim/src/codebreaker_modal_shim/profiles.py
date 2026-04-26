import modal

from codebreaker_shim_shared.profiles import (  # noqa: F401
    PROFILES,
    profile_fingerprint,
    resolve_profile,
)
from codebreaker_shim_shared.schemas import SandboxProfile


def build_image(profile: SandboxProfile) -> modal.Image:
    image = modal.Image.debian_slim()

    for command in profile.install_commands:
        image = image.run_commands(command)

    return image
