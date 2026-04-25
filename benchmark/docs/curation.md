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

## Curation Process

Curation is performed by [Devin](https://devin.ai/) AI agents, each assigned a single GHSA. The agent follows a structured prompt (see [`docs/prompts/curation_agent.md`](prompts/curation_agent.md)) that walks it through the full curation workflow. Each agent opens a pull request containing exactly two files, which is then reviewed before merging.

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
