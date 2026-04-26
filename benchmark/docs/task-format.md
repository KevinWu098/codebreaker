# Task Format

This document is the authoritative field-level reference for the three data layers in ECVEBench: task records, agent inputs, and agent outputs. Each has a corresponding JSON Schema in [`schema/`](../schema/).

---

## Task Instance

Tasks are stored as individual JSON files in `data/tasks/`, one file per **unique vulnerability** (GHSA), named `{task_id}.json`. Ground truth is included in each task.

**Schema**: [`schema/task.schema.json`](../schema/task.schema.json)

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
| `ground_truth.cvss`                 | float \| null | CVSS score. null if unavailable.                                           |
| `ground_truth.reason`               | string        | Unscored. Human-readable explanation.                                      |
| `ground_truth.locations`            | array         | One or more vulnerable locations                                           |
| `ground_truth.locations[].file`     | string        | Relative path from repo root                                               |
| `ground_truth.locations[].function` | string \| null | Function name. null if not determinable.                                  |

---

## Agent Input

The harness projects a task record into an agent input at a given difficulty. The agent never sees ground truth or hints for difficulties other than the one it is being run at.

**Schema**: [`schema/agent_input.schema.json`](../schema/agent_input.schema.json)

### Fields

| Field               | Type                                       | Description                                                 |
| ------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| `task_id`           | string                                     | GHSA-level identifier (matches `task_id` in task file).     |
| `difficulty`        | `"L0"` \| `"L1"` \| `"L2"` \| `"L3"`     | Difficulty level this input was rendered at.                 |
| `codebase.repo`     | string                                     | GitHub repository URL                                       |
| `codebase.language` | string                                     | Primary language                                            |
| `codebase.ecosystem`| string                                     | Package ecosystem (e.g. npm, pip, maven, go)                |
| `codebase.commit`   | string                                     | Full 40-character pre-patch SHA                             |
| `hint`              | object \| null                             | The hint at this difficulty. `null` for L0.                 |

### Generating an Agent Input

```bash
uv run python -m harness.generate_input \
    --task-id ecvebench-filebrowser-001 --difficulty L1
```

Or as a library:

```python
from benchmark.harness import generate_input, load_task
from pathlib import Path

task = load_task(Path("benchmark/data/tasks"), "ecvebench-filebrowser-001")
agent_input = generate_input(task, "L1")
```

---

## Agent Output

The format agents must return after evaluating a task.

**Schema**: [`schema/output.schema.json`](../schema/output.schema.json)

### Fields

| Field                  | Type                                       | Description                                                 |
| ---------------------- | ------------------------------------------ | ----------------------------------------------------------- |
| `task_id`              | string                                     | GHSA-level identifier. Must match the task being evaluated. |
| `difficulty`           | `"L0"` \| `"L1"` \| `"L2"` \| `"L3"`     | Difficulty the agent ran at. Must match the agent input.    |
| `vulnerable`           | boolean                                    | Agent's verdict                                             |
| `confidence`           | float                                      | 0.0–1.0                                                     |
| `vuln_class`           | string \| null                             | null if `vulnerable` is false                               |
| `locations`            | array                                      | Empty if `vulnerable` is false                              |
| `locations[].file`     | string                                     | Relative path from repo root                                |
| `locations[].function` | string \| null                             | null if not determinable                                    |
| `reason`               | string \| null                             | Unscored. null if `vulnerable` is false.                    |

---

## Internal Metadata

Internal curation data not exposed to agents.

**Schema**: [`schema/metadata.schema.json`](../schema/metadata.schema.json)

### Fields

| Field               | Type    | Description                                                                |
| ------------------- | ------- | -------------------------------------------------------------------------- |
| `ghsa_id`           | string  | Primary key. Source GHSA ID.                                               |
| `post_patch_commit` | string  | Full 40-character SHA of the fixed version. Reserved for negative validation. |
| `noisy_patch`       | boolean | True if the patch touches more than 3 non-test files.                     |
| `curation_notes`    | string  | Free-text notes from the curator.                                          |
| `dataset_version`   | string  | Version of the dataset this record belongs to.                             |
| `snapshot_date`     | string  | Date this record was curated or last updated (ISO 8601).                   |
