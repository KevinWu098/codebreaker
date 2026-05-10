# Scorer

The ECVEBench scorer compares agent outputs against ground truth tasks and reports per-task and aggregate metrics. See [`docs/scoring.md`](../docs/scoring.md) for the full scoring methodology.

## CLI Usage

```bash
cd benchmark

uv run python -m scorer.score \
    --tasks data/tasks/ \
    --outputs path/to/outputs.jsonl \
    --results results.json
```

| Flag | Default | Description |
| --- | --- | --- |
| `--tasks` | `data/tasks/` | Path to tasks directory or JSONL file |
| `--outputs` | (required) | Path to agent outputs directory or JSONL file |
| `--results` | `results.json` | Path to write machine-readable JSON results |

### Input Formats

Both `--tasks` and `--outputs` accept either:

- A **directory** of `.json` files (one record per file)
- A **JSONL file** (one record per line)

### Output

The scorer produces:

- **Console**: A formatted summary table with overall and per-difficulty metrics
- **JSON file**: Machine-readable results with per-task scores and aggregates

## Library Usage

```python
from benchmark.scorer import load_records, score_one, aggregate
from pathlib import Path

# Load data
tasks = {r["task_id"]: r for r in load_records(Path("benchmark/data/tasks"))}
outputs = load_records(Path("outputs.jsonl"))

# Score individual tasks
scores = [score_one(tasks[task_id], candidates) for ...]

# Aggregate
summary = aggregate(scores)
```

### API

- **`load_records(path)`** — Load records from a directory of JSON files or a JSONL file.
- **`score_one(task, candidates)`** — Score one or more candidate outputs for a single task. Keeps the oracle-best.
- **`aggregate(scores)`** — Aggregate per-task scores into summary metrics.
- **`compute_ece(scores)`** — Expected Calibration Error of confidence vs. verdict correctness.
- **`set_iou(predicted, actual)`** — Intersection-over-union of two sets.

## Metrics

| Metric | Description |
| --- | --- |
| Score (mean) | Mean composite score across all tasks |
| Verdict precision/recall/F1 | Binary classification metrics for vulnerability detection |
| Vuln class accuracy | Fraction of correctly classified vulnerability types (gated on correct verdict) |
| File recall (mean) | Mean file-level recall across tasks (gated on correct verdict) |
| Function IoU (diagnostic) | Mean function-level IoU for matched files (not part of composite score) |
| ECE | Expected Calibration Error of confidence vs. verdict accuracy (10 equal-width bins) |
