import hashlib
import json

import modal

from codebreaker_modal_shim.schemas import SandboxProfile, SandboxProfileName

PROFILES: dict[SandboxProfileName, SandboxProfile] = {
    "node": SandboxProfile(
        name="node",
        image="debian_slim",
        install_commands=[
            "apt-get update",
            "apt-get install -y nodejs npm git ca-certificates",
        ],
        memory_mb=1024,
        timeout_seconds=300,
    ),
    "python": SandboxProfile(
        name="python",
        image="debian_slim",
        install_commands=[
            "apt-get update",
            "apt-get install -y python3 python3-pip git ca-certificates",
        ],
        memory_mb=1024,
        timeout_seconds=300,
    ),
    "recon": SandboxProfile(
        name="recon",
        image="debian_slim",
        install_commands=[
            "apt-get update",
            "apt-get install -y curl dnsutils iproute2 nmap python3 python3-pip whois",
        ],
        cpu=2,
        memory_mb=2048,
        timeout_seconds=600,
    ),
}


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
