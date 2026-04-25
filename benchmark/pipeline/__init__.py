"""ECVEBench curation pipeline.

Modules:
    filter_advisories  — Step 1: filter GHSAs from the GitHub Advisory API.
    select_candidates  — Step 2: CWE mapping, CVSS floor, stratified sampling.
    dispatch_devin     — Step 3: send selected candidates to Devin agents.
    lib/               — Shared utilities (API client, filters, CWE map, env).
"""
