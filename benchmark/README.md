# ECVEBench

A large-scale, multi-language cybersecurity benchmark for evaluating AI agents on real-world vulnerability detection and localization tasks. Built on the GitHub Advisory Database, ECVEBench addresses key limitations of existing benchmarks like CyberGYM by covering diverse attack vectors beyond memory-safety bugs in C/C++.

## Overview

Each task presents an agent with a repository at a single commit and asks it to determine whether a vulnerability exists, classify it, and localize it to the relevant file and function. Tasks are derived from reviewed GitHub Security Advisories (GHSAs) with known patch commits, CWE mappings, and CVSS scores.

## Quick Start

```bash
# Install dependencies
cd benchmark
uv sync

# Generate an agent input from a task
uv run python -m harness.generate_input \
    --task-id ecvebench-filebrowser-001 --difficulty L1

# Score agent outputs against ground truth
uv run python -m scorer.score \
    --tasks data/tasks/ --outputs path/to/outputs.jsonl
```

See [`examples/`](examples/) for sample task records and agent inputs at each difficulty level.

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

| Level | Agent receives                                                                  |
| ----- | ------------------------------------------------------------------------------- |
| L0    | Repository at pre-patch commit only. No hint. Pure discovery.                   |
| L1    | Repository + vague localization hint (broad codebase area). No vuln details.    |
| L2    | Repository + scrubbed CVE description (vuln type + mechanism). No location info.|
| L3    | Repository + targeted localization hint and targeted CVE description. More specific than L1/L2 — narrows to ~3-5 files. |

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


---

## Repository Structure

```
benchmark/
├── README.md                          # this file
├── pyproject.toml                     # Python project config
├── .env.example                       # environment variable template
│
├── docs/                              # detailed documentation
│   ├── README.md                      # documentation index
│   ├── scoring.md                     # scoring methodology and metrics
│   ├── task-format.md                 # task, agent input, and agent output schemas
│   ├── curation.md                    # data sourcing, filtering, and curation process
│   └── prompts/
│       └── curation_agent.md          # prompt template for Devin curation agents
│
├── schema/                            # JSON Schema definitions
│   ├── README.md                      # schema overview
│   ├── task.schema.json               # TaskInstance (one per GHSA)
│   ├── agent_input.schema.json        # AgentInput (runtime projection)
│   ├── output.schema.json             # AgentOutput
│   └── metadata.schema.json           # InternalMetadata
│
├── data/
│   └── tasks/                         # one JSON file per unique GHSA
│       └── ecvebench-{project}-{n}.json
│
├── examples/                          # sample task + generated inputs at each level
│   ├── README.md                      # walkthrough of the example files
│   └── ecvebench-filebrowser-001.*
│
├── harness/                           # task → agent input projection
│   ├── README.md                      # harness usage guide
│   ├── __init__.py
│   └── generate_input.py
│
├── scorer/                            # evaluation harness
│   ├── README.md                      # scorer usage guide
│   ├── __init__.py
│   └── score.py
│
├── pipeline/                          # data curation pipeline
│   ├── README.md                      # pipeline usage guide
│   ├── __init__.py
│   ├── filter_advisories.py           # step 1: filter GHSAs from advisory API
│   ├── select_candidates.py           # step 2: CWE mapping + stratified sampling
│   ├── dispatch_devin.py              # step 3: send candidates to Devin agents
│   └── lib/
│       ├── __init__.py
│       ├── cwe_map.py                 # CWE → vulnerability class lookup table
│       ├── env.py                     # environment variable helpers
│       ├── filters.py                 # filter functions and metadata extractors
│       └── github_client.py           # GitHub REST API client with rate-limit handling
│
└── internal/
    └── metadata/                      # one JSON file per GHSA, keyed by GHSA ID
        └── {GHSA-ID}.json
```

## Documentation

| Document | Description |
| --- | --- |
| [Scoring](docs/scoring.md) | Scoring methodology, gated model, aggregate metrics, and calibration diagnostics. |
| [Task Format](docs/task-format.md) | Field-level reference for task records, agent inputs, and agent outputs. |
| [Data Curation](docs/curation.md) | How tasks are sourced, filtered, curated, and validated. |
| [Curation Agent Prompt](docs/prompts/curation_agent.md) | The prompt template sent to Devin for each GHSA. |
| [Schema Overview](schema/README.md) | JSON Schema definitions for all data formats. |
| [Harness](harness/README.md) | Generating difficulty-specific agent inputs from task records. |
| [Scorer](scorer/README.md) | Running the evaluation scorer against agent outputs. |
| [Pipeline](pipeline/README.md) | End-to-end curation pipeline: filter, select, dispatch. |
| [Examples](examples/README.md) | Walkthrough of the included example task and agent inputs. |

## Dataset

- **Source**: GitHub Advisory Database (reviewed advisories only).
- **Curation**: Each task is curated from a reviewed GHSA with a linked patch commit, balanced across vulnerability classes and languages.
- **Versioning**: Each release is a frozen snapshot. See CHANGELOG for version history.
