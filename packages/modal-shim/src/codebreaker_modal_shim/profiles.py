import hashlib
import json
from pathlib import Path

import modal

from codebreaker_modal_shim.schemas import SandboxProfile, SandboxProfileName

_PROFILES_FILENAME = "sandbox-profiles.json"

_SEARCH_PATHS = [
    Path("/app") / _PROFILES_FILENAME,
    Path(__file__).resolve().parents[4] / "packages" / "shared" / "src" / "data" / _PROFILES_FILENAME,
]


def _load_profiles() -> dict[SandboxProfileName, SandboxProfile]:
    for path in _SEARCH_PATHS:
        if path.exists():
            raw: dict[str, dict] = json.loads(path.read_text())
            return {
                name: SandboxProfile.model_validate(profile)  # type: ignore[misc]
                for name, profile in raw.items()
            }

    raise FileNotFoundError(
        f"Cannot find {_PROFILES_FILENAME}; searched {_SEARCH_PATHS}"
    )


PROFILES: dict[SandboxProfileName, SandboxProfile] = _load_profiles()


def resolve_profile(name: SandboxProfileName) -> SandboxProfile:
    return PROFILES[name]


def profile_fingerprint(profile: SandboxProfile) -> str:
    payload = profile.model_dump(mode="json")
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def build_image(profile: SandboxProfile) -> modal.Image:
    image = modal.Image.debian_slim()

    for command in profile.install_commands:
        image = image.run_commands(command)

    return image
