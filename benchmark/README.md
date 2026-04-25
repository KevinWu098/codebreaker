# ECVEBench

A large-scale, multi-language cybersecurity benchmark for evaluating AI agents on real-world vulnerability detection and localization tasks. Built on the GitHub Advisory Database, ECVEBench addresses key limitations of existing benchmarks like CyberGYM by covering diverse attack vectors beyond memory-safety bugs in C/C++.

## Overview

Each task presents an agent with a repository at a single commit and asks it to determine whether a vulnerability exists, classify it, and localize it to the relevant file and function. Tasks are derived from reviewed GitHub Security Advisories (GHSAs) with known patch commits, CWE mappings, and CVSS scores.

## Benchmark Design

### Task Generation

Each GHSA produces up to two task instances:


| Task | Commit served | Hint                 | Ground truth       |
| ---- | ------------- | -------------------- | ------------------ |
| L0   | Pre-patch     | None                 | `vulnerable: true` |
| L1   | Pre-patch     | Scrubbed description | `vulnerable: true` |


The agent sees only the pre-patch commit. It does not know whether a vulnerability exists — that is what it must determine. Negative validation is handled by the evaluation harness using the post-patch commit stored in `internal/metadata.jsonl`, following the same approach as CyberGYM.

### Difficulty Levels


| Level | Agent receives                                                     |
| ----- | ------------------------------------------------------------------ |
| L0    | Repository at pre-patch commit only. No hint. Pure discovery.      |
| L1    | Repository + scrubbed vulnerability description. No location info. |


### Vulnerability Classes

Derived from the MITRE CWE Top 25, bucketed into coarse categories:


| Class                      | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `command-injection`        | Unsanitized input passed to shell exec calls       |
| `sql-injection`            | Unsanitized input in SQL queries                   |
| `xss`                      | Unescaped user input rendered in HTML              |
| `buffer-overflow`          | Out-of-bounds memory read or write                 |
| `use-after-free`           | Memory accessed after deallocation                 |
| `path-traversal`           | Unsanitized file path allows directory escape      |
| `auth-bypass`              | Authentication or authorization check circumvented |
| `xxe`                      | XML external entity injection                      |
| `insecure-deserialization` | Unsafe deserialization of untrusted input          |
| `crypto-weakness`          | Weak or misused cryptographic primitive            |
| `race-condition`           | Unsafe concurrent access to shared resource        |
| `integer-overflow`         | Integer arithmetic wraps or truncates unsafely     |
| `null-deref`               | Null pointer dereferenced without check            |


### Scoring

The following fields are scored:


| Field                | Method                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------- |
| `vulnerable`         | Exact match (boolean). F1 reported separately for positive and negative instances.      |
| `vuln_class`         | Exact match against ground truth class, conditional on correct verdict.                 |
| `locations.file`     | Intersection over Union against ground truth file set.                                  |
| `locations.function` | Intersection over Union against ground truth function set, conditional on correct file. |
| `confidence`         | Expected Calibration Error (ECE) reported as a separate axis.                           |


The following fields are **not scored**:


| Field    | Purpose                                                         |
| -------- | --------------------------------------------------------------- |
| `reason` | Reference only. Used for qualitative analysis of failure cases. |


### Negative Validation

The evaluation harness uses the post-patch commit stored in `internal/metadata.jsonl` to verify that agent-identified vulnerabilities are not present in the patched version. This is not exposed to the agent. If an agent identifies a genuinely different vulnerability in the codebase, this is a known edge case and noted as a benchmark limitation.

---

## Task Instance Format

Tasks are stored as JSONL in `data/tasks.jsonl`, one JSON object per line. Ground truth is included in each task. See `schema/task.schema.json` for the formal schema.

### Fields


| Field                               | Type            | Description                                                         |
| ----------------------------------- | --------------- | ------------------------------------------------------------------- |
| `task_id`                           | string          | Unique identifier. Format: `ecvebench-{project}-{n}-{L0|L1}`        |
| `ghsa_id`                           | string          | Source GitHub Security Advisory ID                                  |
| `difficulty`                        | `"L0"` | `"L1"` | Task difficulty level                                               |
| `codebase.repo`                     | string          | GitHub repository URL                                               |
| `codebase.language`                 | string          | Primary language of the repository                                  |
| `codebase.commit`                   | string          | Full 40-character pre-patch SHA served to the agent                 |
| `hint`                              | object | null   | null for L0. Contains `description` for L1.                         |
| `hint.description`                  | string          | Scrubbed vulnerability description. No file or function references. |
| `ground_truth.vulnerable`           | boolean         | Whether the commit is vulnerable                                    |
| `ground_truth.vuln_class`           | string          | Vulnerability class                                                 |
| `ground_truth.cvss`                 | float | null    | CVSS score. null if unavailable.                                    |
| `ground_truth.reason`               | string          | Unscored. Human-readable explanation.                               |
| `ground_truth.locations`            | array           | One or more vulnerable locations                                    |
| `ground_truth.locations[].file`     | string          | Relative path from repo root                                        |
| `ground_truth.locations[].function` | string | null   | Function name. null if not determinable.                            |


---

## Agent Output Format

See `schema/output.schema.json` for the formal schema.

### Fields


| Field                  | Type          | Description                            |
| ---------------------- | ------------- | -------------------------------------- |
| `task_id`              | string        | Must match the task being evaluated    |
| `vulnerable`           | boolean       | Agent's verdict                        |
| `confidence`           | float         | 0.0–1.0                                |
| `vuln_class`           | string | null | null if vulnerable is false            |
| `locations`            | array         | Empty if vulnerable is false           |
| `locations[].file`     | string        | Relative path from repo root           |
| `locations[].function` | string | null | null if not determinable               |
| `reason`               | string | null | Unscored. null if vulnerable is false. |


---

## Repository Structure

```
benchmark/
├── README.md
├── schema/
│   ├── task.schema.json        # formal JSON Schema for TaskInstance
│   └── output.schema.json      # formal JSON Schema for AgentOutput
├── examples/
│   ├── ecvebench-electerm-001-L0.json
│   └── ecvebench-electerm-001-L1.json
├── data/
│   └── tasks.jsonl             # full dataset including ground truth, one task per line
├── internal/
│   └── metadata.jsonl          # post_patch_commit and curation metadata, not published
└── scorer/
    └── score.py                # evaluation harness
```

## Dataset

Source: GitHub Advisory Database (reviewed advisories only)  
Enrichment: CVSS scores from NVD  
Curation: Filtered for linked patch commits, CWE mappings, and CVSS >= 6.0. Balanced across vulnerability classes and languages.  
Versioning: Each release is a frozen snapshot. See CHANGELOG for version history.