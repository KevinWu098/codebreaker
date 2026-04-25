import hashlib
import json
from pathlib import Path

from codebreaker_shim_shared.schemas import SandboxProfile, SandboxProfileName

_PROFILES_FILENAME = "sandbox-profiles.json"


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
