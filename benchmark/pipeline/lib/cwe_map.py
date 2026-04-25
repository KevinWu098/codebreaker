"""CWE → ECVEBench vulnerability class mapping.

Maps MITRE CWE IDs to the 13 coarse vulnerability classes used by the
benchmark.  Only CWEs with a clear, unambiguous mapping are included —
generic "catch-all" CWEs (e.g. CWE-20, CWE-74, CWE-200) are intentionally
omitted so they don't pollute the dataset with misclassified tasks.

Usage:

    >>> from pipeline.lib.cwe_map import classify
    >>> classify(["CWE-79", "CWE-20"])
    'xss'
    >>> classify(["CWE-20"])  # unmappable
"""

from __future__ import annotations

CWE_TO_CLASS: dict[str, str] = {
    # command-injection
    "CWE-77": "command-injection",
    "CWE-78": "command-injection",
    "CWE-94": "command-injection",
    "CWE-95": "command-injection",
    "CWE-96": "command-injection",
    # sql-injection
    "CWE-89": "sql-injection",
    "CWE-564": "sql-injection",
    # xss
    "CWE-79": "xss",
    "CWE-80": "xss",
    # buffer-overflow
    "CWE-119": "buffer-overflow",
    "CWE-120": "buffer-overflow",
    "CWE-121": "buffer-overflow",
    "CWE-122": "buffer-overflow",
    "CWE-124": "buffer-overflow",
    "CWE-125": "buffer-overflow",
    "CWE-126": "buffer-overflow",
    "CWE-127": "buffer-overflow",
    "CWE-131": "buffer-overflow",
    "CWE-787": "buffer-overflow",
    # use-after-free
    "CWE-415": "use-after-free",
    "CWE-416": "use-after-free",
    # path-traversal
    "CWE-22": "path-traversal",
    "CWE-23": "path-traversal",
    "CWE-36": "path-traversal",
    "CWE-73": "path-traversal",
    # auth-bypass
    "CWE-284": "auth-bypass",
    "CWE-285": "auth-bypass",
    "CWE-287": "auth-bypass",
    "CWE-306": "auth-bypass",
    "CWE-307": "auth-bypass",
    "CWE-862": "auth-bypass",
    "CWE-863": "auth-bypass",
    # xxe
    "CWE-611": "xxe",
    "CWE-776": "xxe",
    # insecure-deserialization
    "CWE-502": "insecure-deserialization",
    # crypto-weakness
    "CWE-295": "crypto-weakness",
    "CWE-326": "crypto-weakness",
    "CWE-327": "crypto-weakness",
    "CWE-328": "crypto-weakness",
    "CWE-330": "crypto-weakness",
    "CWE-331": "crypto-weakness",
    "CWE-338": "crypto-weakness",
    # race-condition
    "CWE-362": "race-condition",
    "CWE-367": "race-condition",
    # integer-overflow
    "CWE-190": "integer-overflow",
    "CWE-191": "integer-overflow",
    "CWE-681": "integer-overflow",
    # null-deref
    "CWE-476": "null-deref",
}

VALID_CLASSES: frozenset[str] = frozenset({
    "command-injection",
    "sql-injection",
    "xss",
    "buffer-overflow",
    "use-after-free",
    "path-traversal",
    "auth-bypass",
    "xxe",
    "insecure-deserialization",
    "crypto-weakness",
    "race-condition",
    "integer-overflow",
    "null-deref",
})


def classify(cwe_ids: list[str]) -> str | None:
    """Return the vulnerability class for a list of CWE IDs, or ``None``.

    Resolution rules:
    1. Map each CWE to its class.  Skip unmappable CWEs.
    2. If all mapped CWEs agree on a single class, return it.
    3. If they disagree (e.g. CWE-79 + CWE-89), return ``None`` — the
       advisory is ambiguous and should be dropped.
    4. If no CWE maps at all, return ``None``.
    """
    classes = {CWE_TO_CLASS[cwe] for cwe in cwe_ids if cwe in CWE_TO_CLASS}
    if len(classes) == 1:
        return classes.pop()
    return None
