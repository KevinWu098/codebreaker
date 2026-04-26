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


### Multi-Candidate Scoring (Oracle Best)

An agent may return up to **3** candidate vulnerability hypotheses per task. The scorer evaluates each candidate independently and keeps the **oracle-best** — the one with the highest composite score. This reduces noise from agents that find a real but unrelated vulnerability alongside the target one.

- **Online (TS) scorer**: the agent's raw output is scanned for up to 3 valid JSON objects matching the `AgentOutput` schema. Each is scored; the best is persisted as the run result.
- **Offline (Python) scorer**: multiple JSONL lines with the same `(task_id, difficulty)` are treated as candidates for the same task. Up to 3 per group are scored; the best is kept.

Single-candidate outputs work identically to before — no changes needed for agents that return one response.

### Scoring

ECVEBench uses **gated scoring** with location recall as the primary metric.

#### Why gated scoring?

Empirically, current models almost always correctly detect whether a vulnerability exists (the `vulnerable` field). Weighting this component would inflate every score without adding discriminative signal. Similarly, vulnerability class identification is a prerequisite for meaningful localization — if the agent misclassifies the vulnerability type, its location predictions are unreliable.

The scoring formula is:

```
if vulnerable verdict is wrong → score = 0
otherwise                      → score = 0.3 × vuln_class_correct + 0.7 × location_recall
```

Where `vuln_class_correct` is 1 if the predicted class matches ground truth, 0 otherwise.

`location_recall` incorporates both exact and sibling file matches:

```
exact_hits     = |predicted_files ∩ ground_truth_files|
sibling_hits   = predicted files not in ground truth that share a parent directory
                 AND at least one function name with a ground truth location
location_recall = min(1.0, (exact_hits + sibling_hits × 0.5) / |ground_truth_files|)
```

**Sibling credit**: when a vulnerability pattern repeats across multiple files in the same directory (e.g., database drivers, protocol handlers), an agent may find the correct vulnerability in a sibling file rather than the specific file the CVE was filed against. Sibling matches receive 50% credit (discount factor 0.5) to reward correct pattern identification while still incentivizing finding the exact CVE location. A predicted file qualifies as a sibling when it (1) is in the same directory as a ground truth file, and (2) contains at least one function name that appears in the ground truth locations.

This means:
- **Vulnerability detection** (`vulnerable`) is a binary gate. Wrong verdict = zero score.
- **Vulnerability classification** (`vuln_class`) is weighted at 30%. Correct class contributes 0.3 to the score.
- **File-level location recall** is weighted at 70%. This is the dominant component because localization is the hardest and most useful part of the task. Sibling file matches receive discounted credit.

#### Why recall instead of IoU?

Agents typically predict a small number of locations (1–3 files), so the risk of inflating scores by predicting many files is low. In a security triage workflow, false positives are cheap (a reviewer can quickly dismiss irrelevant files) while false negatives are expensive (missing the actual vulnerable code). Recall captures this asymmetry.

#### What is scored

| Field                | Method                                                                     |
| -------------------- | -------------------------------------------------------------------------- |
| `vulnerable`         | Binary gate. Incorrect verdict → score 0.                                  |
| `vuln_class`         | Weighted at 30%. Exact match contributes 0.3 to the score.                 |
| `locations.file`     | Weighted at 70%. Recall against ground truth file set, with sibling credit.|

#### What is NOT scored (and why)

| Field                  | Purpose                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `locations.function`   | Required in agent output to force deeper analysis, but not directly scored. Used to determine sibling credit (predicted files must share a function name with ground truth). |
| `sibling_file_hits`    | Diagnostic. Number of predicted files that received discounted sibling credit. Reported for analysis.        |
| `reason`               | Reference only. Used for qualitative analysis of failure cases.                                              |
| `confidence`           | Expected Calibration Error (ECE) is reported separately by the offline scorer as a diagnostic axis.          |

#### Aggregate benchmark score

The overall benchmark score for a model is the **mean per-task score** across all evaluated tasks at a given difficulty:

```
benchmark_score = mean(per_task_scores)
```

This is equivalent to a partial-credit pass rate — tasks where the gate passes contribute their weighted class + location score, and tasks where the gate fails contribute 0.


### Negative Validation (planned)

For future POC-based evaluation tasks, the harness will use the post-patch commit stored in `internal/metadata/` to verify that agent-generated exploits succeed against the vulnerable version and fail against the patched version. This is not exposed to the agent.

---

## Task Instance Format

Tasks are stored as individual JSON files in `data/tasks/`, one file per **unique vulnerability** (GHSA), named `{task_id}.json`. Ground truth is included in each task. See `schema/task.schema.json` for the formal schema.

### Fields


| Field                               | Type          | Description                                                                |
| ----------------------------------- | ------------- | -------------------------------------------------------------------------- |
| `task_id`                           | string        | GHSA-level identifier. Format: `ecvebench-{project}-{n}`. No difficulty suffix. |
| `ghsa_id`                           | string        | Source GitHub Security Advisory ID                                         |
| `codebase.repo`                     | string        | GitHub repository URL                                                      |
| `codebase.language`                 | string        | Primary language of the repository                                         |
| `codebase.ecosystem`               | string        | Package ecosystem (e.g. npm, pip, maven, go)                               |
| `codebase.commit`                   | string        | Full 40-character pre-patch SHA served to the agent                        |
| `hints.L0`                          | null          | L0 is pure discovery; always null.                                         |
| `hints.L1`                          | object        | Vague localization hint. Object with an `area` string.                     |
| `hints.L2`                          | object        | Scrubbed CVE description. Object with a `description` string.             |
| `hints.L3`                          | object        | Targeted hint. More specific than L1/L2 — narrows to ~3-5 files. Object with both `area` and `description` strings. |
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
| `difficulty`        | `"L0"` | `"L1"` | `"L2"` | `"L3"` | Difficulty level this input was rendered at.                |
| `codebase.repo`     | string          | GitHub repository URL                                       |
| `codebase.language` | string          | Primary language                                            |
| `codebase.ecosystem`| string          | Package ecosystem (e.g. npm, pip, maven, go)                |
| `codebase.commit`   | string          | Full 40-character pre-patch SHA                             |
| `hint`              | object | null   | The hint at this difficulty. `null` for L0.                 |


### Generating an agent input

```bash
python benchmark/harness/generate_input.py \
    --task-id ecvebench-filebrowser-001 \
    --difficulty L1
```

Or as a library:

```python
from benchmark.harness import generate_input, load_task
from pathlib import Path

task = load_task(Path("benchmark/data/tasks"), "ecvebench-filebrowser-001")
agent_input = generate_input(task, "L1")
```

---

## Agent Output Format

See `schema/output.schema.json` for the formal schema.

### Fields


| Field                  | Type            | Description                                                 |
| ---------------------- | --------------- | ----------------------------------------------------------- |
| `task_id`              | string          | GHSA-level identifier. Must match the task being evaluated. |
| `difficulty`           | `"L0"` | `"L1"` | `"L2"` | `"L3"` | Difficulty the agent ran at. Must match the agent input.    |
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
│       └── ecvebench-filebrowser-001.json
├── internal/
│   └── metadata/                  # one JSON file per GHSA, keyed by GHSA ID
│       └── GHSA-5gg9-5g7w-hm73.json
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