"""Advisory metadata filters for the ECVEBench curation pipeline.

Each filter function returns ``(passed, drop_reason)`` where ``drop_reason``
is ``None`` when the advisory passes and a short string key when it doesn't.
"""

from __future__ import annotations

from typing import Any


# ---------------------------------------------------------------------------
# Extraction helpers
# ---------------------------------------------------------------------------


def extract_ecosystem(advisory: dict[str, Any]) -> str | None:
    """Pull the first ecosystem from the advisory's vulnerabilities list."""
    vulns = advisory.get("vulnerabilities") or []
    for vuln in vulns:
        pkg = vuln.get("package") or {}
        eco = pkg.get("ecosystem")
        if eco:
            return eco.lower()
    return None


def extract_cwe_ids(advisory: dict[str, Any]) -> list[str]:
    """Pull CWE IDs from the advisory."""
    cwes = advisory.get("cwes") or []
    ids: list[str] = []
    for cwe in cwes:
        cwe_id = cwe.get("cwe_id") if isinstance(cwe, dict) else None
        if cwe_id:
            ids.append(cwe_id)
    return ids


def extract_cvss(advisory: dict[str, Any]) -> float | None:
    """Extract CVSS score from the advisory, preferring v3 over v4."""
    severities = advisory.get("cvss_severities") or {}
    for version in ("cvss_v3", "cvss_v4"):
        entry = severities.get(version)
        if isinstance(entry, dict):
            score = entry.get("score")
            if isinstance(score, (int, float)) and score > 0:
                return float(score)
    return None


# ---------------------------------------------------------------------------
# Hard filters
# ---------------------------------------------------------------------------


def has_description(advisory: dict[str, Any]) -> tuple[bool, str | None]:
    desc = advisory.get("description")
    if not desc or not isinstance(desc, str) or not desc.strip():
        return False, "no_description"
    return True, None


def is_english(description: str) -> tuple[bool, str | None]:
    """Check whether a description is primarily English via ASCII ratio."""
    if not description:
        return False, "no_english_description"
    ascii_chars = sum(1 for c in description if ord(c) < 128)
    ratio = ascii_chars / len(description)
    if ratio < 0.85:
        return False, "no_english_description"
    return True, None


def is_single_package(advisory: dict[str, Any]) -> tuple[bool, str | None]:
    """Reject advisories that affect multiple packages (ambiguous scope)."""
    vulns = advisory.get("vulnerabilities") or []
    if len(vulns) != 1:
        return False, "multi_package"
    return True, None


def has_reference_url(advisory: dict[str, Any]) -> tuple[bool, str | None]:
    """Reject advisories with no commit, PR, or tag references."""
    refs = advisory.get("references") or []
    for ref in refs:
        url = ref if isinstance(ref, str) else ref.get("url", "")
        if any(pattern in url for pattern in ("/commit/", "/pull/", "/releases/tag/")):
            return True, None
    return False, "no_reference"


def has_cvss(advisory: dict[str, Any]) -> tuple[bool, str | None]:
    """Reject advisories without a CVSS score."""
    score = extract_cvss(advisory)
    if score is None:
        return False, "no_cvss"
    return True, None
