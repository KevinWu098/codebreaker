# Harness

The harness projects ECVEBench task records into difficulty-specific agent inputs. Following CyberGYM's pattern, there is one record per unique vulnerability — difficulty is a runtime parameter, not a separate task.

## What It Does

Given a task record and a difficulty level (L0–L3), the harness:

1. Selects the appropriate hint for the requested difficulty
2. Strips ground truth (`ghsa_id`, `ground_truth`) from the output
3. Produces an `AgentInput` JSON object ready to be fed to an agent

## CLI Usage

```bash
cd benchmark

uv run python -m harness.generate_input \
    --task-id ecvebench-filebrowser-001 \
    --difficulty L1
```

| Flag | Default | Description |
| --- | --- | --- |
| `--task-id` | (required) | GHSA-level task identifier |
| `--difficulty` | (required) | `L0`, `L1`, `L2`, or `L3` |
| `--tasks` | `data/tasks/` | Path to tasks directory or JSONL file |

Output is written to stdout as pretty-printed JSON.

## Library Usage

```python
from benchmark.harness import generate_input, load_task
from pathlib import Path

task = load_task(Path("benchmark/data/tasks"), "ecvebench-filebrowser-001")
agent_input = generate_input(task, "L1")
```

### API

- **`load_task(tasks_path, task_id)`** — Load a single task record. Accepts a directory of `.json` files or a JSONL file.
- **`generate_input(task, difficulty)`** — Project a task into an agent input at the given difficulty. Returns a dict matching `schema/agent_input.schema.json`.
- **`DIFFICULTIES`** — Tuple of valid difficulty levels: `("L0", "L1", "L2", "L3")`.

## Examples

See [`examples/`](../examples/) for pre-generated agent inputs at each difficulty level.
