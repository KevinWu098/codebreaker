# Data Curation

This document describes how ECVEBench tasks are sourced, filtered, curated, and validated. It is intended as a reference for contributors, reviewers, and anyone reproducing the dataset.

## Data Source

All tasks are derived from the [GitHub Advisory Database](https://github.com/advisories), the largest open collection of reviewed security advisories for open-source software. We restrict to **reviewed** advisories only — these have been triaged by GitHub's security team, ensuring a baseline of accuracy for severity ratings, CWE classifications, and linked references.

Each advisory (identified by a GHSA ID) describes a vulnerability in one or more open-source packages and typically links to the patch commit, pull request, or release that fixed it.

### Why GitHub Advisories?

- **Scale**: Tens of thousands of reviewed advisories across all major ecosystems.
- **Structured metadata**: CWE IDs, CVSS scores, affected version ranges, and reference links are machine-readable.
- **Multi-language coverage**: Unlike NVD, which skews toward C/C++ due to historical CVE reporting patterns, GHSA covers JavaScript, Python, Go, Rust, Java, Ruby, and more. This directly addresses a key limitation of existing benchmarks like CyberGYM, which focus almost exclusively on memory-safety bugs in C/C++.
- **Patch linkage**: Most reviewed advisories link directly to the commit or PR that fixed the vulnerability, enabling automatic identification of the pre-patch (vulnerable) and post-patch (fixed) states.

### What we do not use

- **NVD (National Vulnerability Database)**: NVD data is not fetched during curation. If an advisory lacks a CVSS score on GitHub, the field is set to `null` rather than cross-referencing NVD. This keeps the pipeline simple and avoids rate-limit and API-key dependencies on a second data source.
- **Unreviewed advisories**: These are community-submitted and may contain inaccurate or incomplete information. We exclude them entirely.

---

## Selection Criteria

An advisory is eligible for curation if it passes all of the following hard filters:

### Must-have

| Criterion | Rationale |
| --- | --- |
| **Reviewed status** | Ensures advisory has been vetted by GitHub's security team. |
| **Resolvable patch commit** | The advisory must reference a commit, PR, or tag that can be resolved to a specific Git SHA. Without this, we cannot identify the pre-patch state. |
| **Single repository** | The vulnerability must be localizable to one repository. Advisories spanning multiple repos are excluded. |
| **English description** | The advisory description must be in English. Non-English advisories are skipped for consistency in hint generation. |
| **Classifiable vulnerability** | The vulnerability must fit one of the 13 canonical vulnerability classes (see below). Advisories for misconfigurations, information leaks without a clear code-level root cause, or denial-of-service via resource exhaustion are excluded. |

### Nice-to-have (soft preferences for balance)

| Criterion | Notes |
| --- | --- |
| **Language diversity** | Prefer advisories that increase coverage of underrepresented languages in the dataset. |
| **Class diversity** | Prefer advisories that fill gaps in underrepresented vulnerability classes. |
| **Clean patch** | Prefer advisories where the patch modifies 3 or fewer non-test source files. Noisy patches are allowed but flagged in metadata. |

---

## Vulnerability Taxonomy

Each task is assigned exactly one vulnerability class, derived from the advisory's CWE IDs and description. The taxonomy is based on the MITRE CWE Top 25, bucketed into 13 coarse categories:

| Class | Description |
| --- | --- |
| `command-injection` | Unsanitized input passed to shell exec calls |
| `sql-injection` | Unsanitized input in SQL queries |
| `xss` | Unescaped user input rendered in HTML |
| `buffer-overflow` | Out-of-bounds memory read or write |
| `use-after-free` | Memory accessed after deallocation |
| `path-traversal` | Unsanitized file path allows directory escape |
| `auth-bypass` | Authentication or authorization check circumvented |
| `xxe` | XML external entity injection |
| `insecure-deserialization` | Unsafe deserialization of untrusted input |
| `crypto-weakness` | Weak or misused cryptographic primitive |
| `race-condition` | Unsafe concurrent access to shared resource |
| `integer-overflow` | Integer arithmetic wraps or truncates unsafely |
| `null-deref` | Null pointer dereferenced without check |

Advisories that do not clearly map to one of these classes are excluded. We intentionally keep the taxonomy coarse — fine-grained CWE subcategories often overlap and create ambiguity for both curators and evaluated agents.

---

## Pipeline Overview

Curation is a three-stage process:

1. **Filter** (script) — Paginate through all ~30k reviewed GHSAs and apply cheap metadata filters. No repos are cloned, no diffs are read. This produces a broad candidate list.
2. **Select** (script) — Map CWE IDs to the 13 vulnerability classes, apply a CVSS floor, and perform stratified random sampling so every class is represented. This produces the final dispatch list.
3. **Curate** (Devin agents) — For each selected GHSA, a Devin AI agent clones the repo, reads the diff, classifies the vulnerability, localizes it, writes the task and metadata JSON files, and opens a PR.

### Stage 1: Filtering

The filter script (`pipeline/filter_advisories.py`) paginates through the GitHub Advisory REST API and applies the following hard filters using only advisory metadata — no additional API calls per advisory:

| Filter | Field checked |
| --- | --- |
| Has description | `description` is non-empty |
| English language | ASCII character ratio >= 85% |
| Single package | `vulnerabilities` array has exactly 1 entry |
| Has linked reference | `references` contain at least one commit, PR, or tag URL |
| Has CVSS score | `cvss_severities` contains a v3 or v4 score |
| Dedup | No duplicate GHSA IDs |

The output is a JSONL file (`pipeline/output/filtered.jsonl`) where each line contains a GHSA ID plus metadata for downstream sampling: severity, CVSS score, CWE IDs, ecosystem, and publication date.

```bash
GITHUB_TOKEN=ghp_... uv run python -m pipeline.filter_advisories
```

The script supports checkpointing (`--checkpoint`) for resumption across runs and `--max-pages` for testing.

### Stage 2: Selection and Sampling

The selection script (`pipeline/select_candidates.py`) reads the filtered output and narrows it down to a balanced dispatch list:

1. **Deduplication** — removes duplicate GHSA IDs left from overlapping filter runs.
2. **CWE → class mapping** — each advisory's CWE IDs are mapped to one of the 13 vulnerability classes via a curated lookup table (`pipeline/lib/cwe_map.py`). Advisories with no CWE, unmappable CWEs, or conflicting CWEs (mapping to multiple classes) are dropped.
3. **CVSS floor** — advisories below a configurable minimum CVSS score (default: 4.0) are dropped to exclude trivial issues.
4. **Stratified sampling** — the remaining candidates are split by class, and up to N are randomly sampled from each class. N is calculated as `ceil(target_tasks × overprovision_factor / 13)`. Classes with fewer candidates than N are taken in full.

```bash
uv run python -m pipeline.select_candidates --target 500 --overprovision 2.5
```

| Flag | Default | Description |
| --- | --- | --- |
| `--target` | 500 | Target number of final benchmark tasks |
| `--overprovision` | 2.5 | Multiplier to account for Devin rejection rate |
| `--cvss-floor` | 4.0 | Minimum CVSS score (0 to disable) |
| `--seed` | 42 | Random seed for reproducible sampling |

The output is `pipeline/output/candidates.jsonl` — the list of GHSAs to dispatch to Devin agents.

### Selection summary

The full pipeline (30k reviewed GHSAs → filter → select) produces the following funnel:

| Stage | Count |
| --- | --- |
| Reviewed GHSAs in GitHub Advisory Database | ~30,000 |
| After Stage 1 metadata filters | ~12,000 |
| After CWE mapping + CVSS floor (≥ 4.0) | ~6,100 |
| After stratified sampling (target 500) | **494** |

Class distribution in the final candidate set — 38 per class, evenly balanced:

| Class | Count |
| --- | --- |
| `auth-bypass` | 38 |
| `buffer-overflow` | 38 |
| `command-injection` | 38 |
| `crypto-weakness` | 38 |
| `insecure-deserialization` | 38 |
| `integer-overflow` | 38 |
| `null-deref` | 38 |
| `path-traversal` | 38 |
| `race-condition` | 38 |
| `sql-injection` | 38 |
| `use-after-free` | 38 |
| `xss` | 38 |
| `xxe` | 38 |

Ecosystem distribution:

| Ecosystem | Count |
| --- | --- |
| pip (Python) | 109 |
| go | 87 |
| maven (Java) | 77 |
| npm (JavaScript) | 65 |
| rust | 64 |
| composer (PHP) | 59 |
| rubygems (Ruby) | 13 |
| nuget (C#) | 13 |
| swift, actions, erlang | 7 |

### Stage 3: Curation (Devin agents)

Each selected GHSA is dispatched to a [Devin](https://devin.ai/) agent. The agent follows a structured prompt (see [`docs/prompts/curation_agent.md`](prompts/curation_agent.md)) that walks it through the full curation workflow. Each agent opens a pull request containing exactly two files, which is then reviewed before merging.

### Per-advisory workflow

1. **Read the advisory.** The agent navigates to the GHSA URL and extracts the description, severity, CWE IDs, CVE ID, and all reference links.

2. **Resolve the patch commit.** From the advisory's references, the agent locates the patch commit SHA. This may involve resolving a PR merge commit or a release tag to its underlying commit. If no patch commit can be found, the advisory is rejected.

3. **Identify the pre-patch commit.** The pre-patch commit is the first parent of the patch commit. This is the commit served to agents during evaluation — it contains the vulnerability.

4. **Examine the patch diff.** The agent analyzes the diff to identify which source files and functions were modified (excluding tests, docs, configs, and changelogs). It also determines whether the patch is "noisy" (more than 3 non-test source files changed).

5. **Classify the vulnerability.** Using the advisory description and CWE IDs, the agent assigns exactly one of the 13 vulnerability classes. If the vulnerability does not fit, the advisory is rejected.

6. **Derive locations.** The agent identifies the specific file(s) and function(s) where the vulnerability exists in the pre-patch code. The priority order is:
   - Advisory description (highest quality, if it explicitly names files/functions)
   - Patch diff (what was removed or modified is where the vulnerability was)
   - For noisy patches, advisory description is preferred over the diff

7. **Write the L1 hint.** The agent takes the advisory description and scrubs all file paths, function names, line numbers, variable names, and code snippets. The result describes *what* the vulnerability is without revealing *where* it is.

8. **Generate the task ID.** Format: `ecvebench-{project}-{NNN}`, where `{project}` is the lowercased repo name and `{NNN}` is a zero-padded sequence number.

9. **Create the task file.** Written to `benchmark/data/tasks/{task_id}.json` following `schema/task.schema.json`.

10. **Create the metadata file.** Written to `benchmark/internal/metadata/{GHSA_ID}.json` following `schema/metadata.schema.json`.

11. **Open a PR.** Branch: `curate/{task_id}`. The PR contains exactly the two new files.

### Why AI agents for curation?

The primary bottleneck in manually curating vulnerability benchmarks is reading the patch diff, understanding the vulnerability root cause, and accurately localizing it. Traditional script-based pipelines can fetch advisory metadata and filter by hard criteria, but they cannot:

- Read and comprehend large, multi-file diffs
- Distinguish meaningful code changes from noise (refactoring, formatting, unrelated fixes bundled in the same commit)
- Scrub a description of location-revealing details while preserving its semantic content
- Determine whether a function name in the diff is the *root cause* location or just a call site

Devin agents handle all of these tasks in a single pass. Each agent works on one advisory in isolation, and the per-PR output makes review and correction straightforward.

---

## Output Artifacts

Each curated advisory produces two files:

### Task file

**Path**: `benchmark/data/tasks/{task_id}.json`
**Schema**: `schema/task.schema.json`

Contains everything needed for evaluation: the codebase pointer (repo, language, pre-patch commit), hints at each difficulty level, and the ground truth (vulnerability class, locations, CVSS score, explanation).

### Metadata file

**Path**: `benchmark/internal/metadata/{GHSA_ID}.json`
**Schema**: `schema/metadata.schema.json`

Contains internal curation data not exposed to agents: the post-patch commit SHA (used for negative validation), whether the patch was noisy, free-text curation notes, the dataset version, and the snapshot date.

---

## Quality Assurance

Every curated task is validated against the following checklist before merging:

| Check | What it verifies |
| --- | --- |
| **Pre-patch SHA** | The `commit` field in the task is the parent of the patch commit, not the patch itself. |
| **Post-patch SHA** | The `post_patch_commit` in metadata is the actual patch commit. |
| **SHA format** | Both SHAs are full 40-character lowercase hex strings. |
| **Hint scrubbing** | The L1 hint contains no file paths, function names, line numbers, variable names, or code snippets. |
| **Vulnerability class** | Exactly one of the 13 allowed values. |
| **Locations non-empty** | At least one location entry exists. |
| **File paths valid** | All `file` paths in locations are relative from the repo root and exist in the pre-patch commit. |
| **JSON validity** | Files are valid JSON, pretty-printed with 2-space indentation. |
| **Schema compliance** | Both files pass validation against their respective JSON schemas. |

### Negative validation

During evaluation (not curation), the harness uses the post-patch commit to check the agent's findings against the fixed version. If a reported vulnerability is absent in the patched code, this confirms the agent found the intended vulnerability. This follows the same approach as CyberGYM's negative validation.

---

## Dataset Versioning

Each release of ECVEBench is a frozen snapshot. The `dataset_version` field in metadata tracks which version a task belongs to. Tasks are never silently modified after release — corrections are issued as new versions.

See the repository CHANGELOG for version history.
