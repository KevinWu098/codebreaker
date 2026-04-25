# ECVEBench

A large-scale, multi-language cybersecurity benchmark for evaluating AI agents on real-world vulnerability detection and localization tasks. Built on the GitHub Advisory Database, ECVEBench addresses key limitations of existing benchmarks like CyberGYM by covering diverse attack vectors beyond memory-safety bugs in C/C++.

## Overview

Each task presents an agent with a repository at a single commit and asks it to determine whether a vulnerability exists, classify it, and localize it to the relevant file and function. Tasks are derived from reviewed GitHub Security Advisories (GHSAs) with known patch commits, CWE mappings, and CVSS scores.

## Benchmark Design

### Three-Layer Model

ECVEBench follows CyberGYM's pattern: **difficulty is a runtime parameter, not a separate task**. There is one record per unique vulnerability (GHSA). The harness projects that record into a difficulty-specific agent input at evaluation time.


| Layer        | What it is                                                   | Schema                           | Lives in                                            |
| ------------ | ------------------------------------------------------------ | -------------------------------- | --------------------------------------------------- |
| Task         | Canonical record per GHSA. All hint variants + ground truth. | `schema/task.schema.json`        | `data/tasks/{task_id}.json`                         |
| Agent input  | Difficulty-specific projection of a task. No ground truth.   | `schema/agent_input.schema.json` | Generated at runtime by `harness/generate_input.py` |
| Agent output | Agent's verdict, class, locations, confidence, difficulty.   | `schema/output.schema.json`      | Returned by the agent, consumed by the scorer       |


The agent sees only the pre-patch commit and the difficulty-specific hint. It does not know whether a vulnerability exists — that is what it must determine.

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


### Negative Validation (planned)

For future POC-based evaluation tasks, the harness will use the post-patch commit stored in `internal/metadata/` to verify that agent-generated exploits succeed against the vulnerable version and fail against the patched version. This is not exposed to the agent.

---

## Task Instance Format

Tasks are stored as individual JSON files in `data/tasks/`, one file per **unique vulnerability** (GHSA), named `{task_id}.json`. Ground truth is included in each task. See `schema/task.schema.json` for the formal schema.

### Fields


| Field                               | Type          | Description                                                                |
| ----------------------------------- | ------------- | -------------------------------------------------------------------------- |
| `task_id`                           | string        | GHSA-level identifier. Format: `ecvebench-{project}-{n}`. No L0/L1 suffix. |
| `ghsa_id`                           | string        | Source GitHub Security Advisory ID                                         |
| `codebase.repo`                     | string        | GitHub repository URL                                                      |
| `codebase.language`                 | string        | Primary language of the repository                                         |
| `codebase.ecosystem`               | string        | Package ecosystem (e.g. npm, pip, maven, go)                               |
| `codebase.commit`                   | string        | Full 40-character pre-patch SHA served to the agent                        |
| `hints.L0`                          | null          | L0 is pure discovery; always null.                                         |
| `hints.L1`                          | object        | Scrubbed vulnerability description. Object with a `description` string.    |
| `ground_truth.vulnerable`           | boolean       | Whether the commit is vulnerable                                           |
| `ground_truth.vuln_class`           | string        | Vulnerability class                                                        |
| `ground_truth.cvss`                 | float | null  | CVSS score. null if unavailable.                                           |
| `ground_truth.reason`               | string        | Unscored. Human-readable explanation.                                      |
| `ground_truth.locations`            | array         | One or more vulnerable locations                                           |
| `ground_truth.locations[].file`     | string        | Relative path from repo root                                               |
| `ground_truth.locations[].function` | string | null | Function name. null if not determinable.                                   |


---

## Agent Input Format

The harness projects a task record into an agent input at a given difficulty. The agent never sees ground truth or hints for difficulties other than the one it is being run at. See `schema/agent_input.schema.json` for the formal schema.

### Fields


| Field               | Type            | Description                                                 |
| ------------------- | --------------- | ----------------------------------------------------------- |
| `task_id`           | string          | GHSA-level identifier (matches `task_id` in task file).     |
| `difficulty`        | `"L0"` | `"L1"` | Difficulty level this input was rendered at.                |
| `codebase.repo`     | string          | GitHub repository URL                                       |
| `codebase.language` | string          | Primary language                                            |
| `codebase.ecosystem`| string          | Package ecosystem (e.g. npm, pip, maven, go)                |
| `codebase.commit`   | string          | Full 40-character pre-patch SHA                             |
| `hint`              | object | null   | The hint at this difficulty. `null` for L0.                 |


### Generating an agent input

```bash
python benchmark/harness/generate_input.py \
    --task-id ecvebench-electerm-001 \
    --difficulty L1
```

Or as a library:

```python
from benchmark.harness import generate_input, load_task
from pathlib import Path

task = load_task(Path("benchmark/data/tasks"), "ecvebench-electerm-001")
agent_input = generate_input(task, "L1")
```

---

## Agent Output Format

See `schema/output.schema.json` for the formal schema.

### Fields


| Field                  | Type            | Description                                                 |
| ---------------------- | --------------- | ----------------------------------------------------------- |
| `task_id`              | string          | GHSA-level identifier. Must match the task being evaluated. |
| `difficulty`           | `"L0"` | `"L1"` | Difficulty the agent ran at. Must match the agent input.    |
| `vulnerable`           | boolean         | Agent's verdict                                             |
| `confidence`           | float           | 0.0–1.0                                                     |
| `vuln_class`           | string | null   | null if `vulnerable` is false                               |
| `locations`            | array           | Empty if `vulnerable` is false                              |
| `locations[].file`     | string          | Relative path from repo root                                |
| `locations[].function` | string | null   | null if not determinable                                    |
| `reason`               | string | null   | Unscored. null if `vulnerable` is false.                    |


---

## Repository Structure

```
benchmark/
├── README.md
├── pyproject.toml
├── docs/
│   ├── curation.md                # data sourcing, filtering, and curation process
│   └── prompts/
│       └── curation_agent.md      # prompt template for Devin curation agents
├── schema/
│   ├── task.schema.json           # JSON Schema for TaskInstance (one per GHSA)
│   ├── agent_input.schema.json    # JSON Schema for AgentInput (runtime projection)
│   ├── output.schema.json         # JSON Schema for AgentOutput
│   └── metadata.schema.json       # JSON Schema for InternalMetadata
├── pipeline/
│   ├── filter_advisories.py       # step 1: filter GHSAs from advisory API
│   ├── select_candidates.py       # step 2: CWE mapping + stratified sampling
│   ├── dispatch_devin.py          # step 3: send candidates to Devin agents
│   ├── lib/
│   │   ├── cwe_map.py             # CWE → vulnerability class lookup table
│   │   ├── env.py                 # environment variable helpers
│   │   ├── filters.py             # filter functions and metadata extractors
│   │   └── github_client.py       # GitHub REST API client with rate-limit handling
│   ├── output/                    # gitignored runtime artifacts
│   └── scratch/                   # gitignored throwaway experiments
├── data/
│   └── tasks/                     # one JSON file per unique GHSA
│       └── ecvebench-electerm-001.json
├── internal/
│   └── metadata/                  # one JSON file per GHSA, keyed by GHSA ID
│       └── GHSA-8x35-hph8-37hq.json
├── harness/
│   ├── __init__.py
│   └── generate_input.py          # task -> agent input projection
└── scorer/
    ├── __init__.py
    └── score.py                   # evaluation harness
```

## Documentation

- **[Data Curation](docs/curation.md)** — How tasks are sourced, filtered, curated, and validated.
- **[Curation Agent Prompt](docs/prompts/curation_agent.md)** — The prompt template sent to Devin for each GHSA.

## Dataset

Source: GitHub Advisory Database (reviewed advisories only)  
Curation: Each task is curated from a reviewed GHSA with a linked patch commit. Balanced across vulnerability classes and languages.  
Versioning: Each release is a frozen snapshot. See CHANGELOG for version history.