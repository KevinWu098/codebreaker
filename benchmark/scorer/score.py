"""ECVEBench scorer.

Compares agent outputs against ECVEBench ground truth tasks and reports
per-task and aggregate metrics. Each task record (one per GHSA) is scored
against at most one agent output per (task_id, difficulty) pair. Difficulty
is read from the agent output's self-described ``difficulty`` field, since
the dataset stores one row per GHSA and projects difficulty at runtime.

When multiple outputs share the same ``(task_id, difficulty)`` key the
scorer treats them as alternative candidate hypotheses (up to 3). Each
candidate is scored independently and the oracle-best — the one with the
highest composite score — is kept as the task's result.

Scoring uses a gated model (see benchmark/README.md for the authoritative
spec):

* ``vulnerable``       - binary gate. Wrong verdict → composite score 0.
* ``vuln_class``       - binary gate. Wrong class → composite score 0.
* ``locations.file``   - file-level recall against ground truth file set.
                         This is the composite score when both gates pass.

The following are tracked as diagnostic axes but do not affect the
composite score:

* ``locations.function`` - required in agent output to encourage deeper
  analysis but not scored (agents rarely predict functions accurately).
  Function IoU is still computed and reported for diagnostics.
* ``confidence``       - Expected Calibration Error against verdict accuracy,
  computed in 10 equal-width bins on ``[0, 1]``.

``reason`` is intentionally not scored.

Stdlib only. Run as a script:

    python benchmark/scorer/score.py \\
        --tasks benchmark/data/tasks/ \\
        --outputs path/to/outputs.jsonl \\
        --results results.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Iterable, Literal

Difficulty = Literal["L0", "L1", "L2", "L3"]
DIFFICULTIES: tuple[Difficulty, ...] = ("L0", "L1", "L2", "L3")
ECE_BIN_COUNT = 10
MAX_CANDIDATES = 3

DEFAULT_TASKS_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "tasks"
)
DEFAULT_RESULTS_PATH = Path("results.json")


def _emit_warning(message: str) -> None:
    print(f"warning: {message}", file=sys.stderr)


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------


def load_records(path: Path) -> list[dict[str, Any]]:
    """Load task or output records from a path.

    Accepts either a directory of ``*.json`` files (one record per file) or a
    single JSONL file (one record per line). Returns a list of dicts.
    """
    if path.is_dir():
        return _load_json_dir(path)
    return _load_jsonl(path)


def _load_json_dir(directory: Path) -> list[dict[str, Any]]:
    """Load all ``*.json`` files in *directory* as records."""
    records: list[dict[str, Any]] = []
    for filepath in sorted(directory.glob("*.json")):
        with filepath.open() as f:
            try:
                record = json.load(f)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSON in {filepath}: {exc}") from exc
        if not isinstance(record, dict):
            raise ValueError(
                f"Expected JSON object in {filepath}, "
                f"got {type(record).__name__}"
            )
        records.append(record)
    return records


def _load_jsonl(path: Path) -> list[dict[str, Any]]:
    """Load a JSONL file into a list of dicts."""
    records: list[dict[str, Any]] = []
    with path.open() as f:
        for line_no, raw_line in enumerate(f, start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(
                    f"Invalid JSON in {path} on line {line_no}: {exc}"
                ) from exc
            if not isinstance(record, dict):
                raise ValueError(
                    f"Expected JSON object in {path} on line {line_no}, "
                    f"got {type(record).__name__}"
                )
            records.append(record)
    return records


def index_tasks(records: Iterable[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Index task records by ``task_id``."""
    return {r["task_id"]: r for r in records}


# ---------------------------------------------------------------------------
# Set helpers
# ---------------------------------------------------------------------------


def set_iou(predicted: set[Any], actual: set[Any]) -> float:
    """Intersection-over-union of two sets.

    Returns ``1.0`` if both sets are empty (perfect match by convention) and
    ``0.0`` if exactly one side is empty.
    """
    if not predicted and not actual:
        return 1.0
    union = predicted | actual
    if not union:
        return 0.0
    return len(predicted & actual) / len(union)


def set_recall(predicted: set[Any], actual: set[Any]) -> float:
    """Recall of *predicted* against *actual* (ground truth).

    Returns ``1.0`` if *actual* is empty (nothing to miss) and ``0.0`` if
    *actual* is non-empty but *predicted* is empty.
    """
    if not actual:
        return 1.0
    return len(predicted & actual) / len(actual)


def _file_set(locations: Iterable[dict[str, Any]]) -> set[str]:
    return {
        loc["file"]
        for loc in locations
        if isinstance(loc, dict) and isinstance(loc.get("file"), str)
    }


def _function_pairs(
    locations: Iterable[dict[str, Any]], files: set[str]
) -> set[tuple[str, str]]:
    """Return ``(file, function)`` pairs restricted to ``files`` with non-null functions."""
    pairs: set[tuple[str, str]] = set()
    for loc in locations:
        if not isinstance(loc, dict):
            continue
        file_value = loc.get("file")
        function_value = loc.get("function")
        if (
            isinstance(file_value, str)
            and file_value in files
            and isinstance(function_value, str)
        ):
            pairs.add((file_value, function_value))
    return pairs


# ---------------------------------------------------------------------------
# Per-task scoring
# ---------------------------------------------------------------------------


def _score_candidate(
    task: dict[str, Any], candidate: dict[str, Any]
) -> dict[str, Any]:
    """Score a single candidate against ground truth.

    Uses gated scoring: vulnerability detection and class identification are
    binary gates. The composite score equals file-level recall when both gates
    pass, and 0 otherwise. Function IoU is computed as a diagnostic but does
    not affect the composite.
    """
    ground_truth = task["ground_truth"]
    gt_vulnerable = bool(ground_truth["vulnerable"])
    pred_vulnerable = bool(candidate.get("vulnerable", False))
    verdict_correct = gt_vulnerable == pred_vulnerable

    confidence = float(candidate.get("confidence", 0.0))

    score: dict[str, Any] = {
        "ground_truth_vulnerable": gt_vulnerable,
        "predicted_vulnerable": pred_vulnerable,
        "verdict_correct": verdict_correct,
        "confidence": confidence,
        "vuln_class_correct": None,
        "file_recall": None,
        "function_iou": None,
        "score": 0.0,
    }

    if not verdict_correct:
        return score

    if not pred_vulnerable:
        score["vuln_class_correct"] = False
        score["file_recall"] = 0.0
        return score

    vuln_class_correct = (
        candidate.get("vuln_class") == ground_truth.get("vuln_class")
    )
    score["vuln_class_correct"] = vuln_class_correct

    gt_locations = ground_truth.get("locations") or []
    pred_locations = candidate.get("locations") or []
    gt_files = _file_set(gt_locations)
    pred_files = _file_set(pred_locations)
    file_recall = set_recall(pred_files, gt_files)
    score["file_recall"] = file_recall

    common_files = pred_files & gt_files
    if common_files:
        gt_pairs = _function_pairs(gt_locations, common_files)
        pred_pairs = _function_pairs(pred_locations, common_files)
        if gt_pairs or pred_pairs:
            score["function_iou"] = set_iou(pred_pairs, gt_pairs)

    score["score"] = file_recall if vuln_class_correct else 0.0

    return score


def _candidate_rank_key(score: dict[str, Any]) -> float:
    """Ranking key for picking the oracle-best candidate.

    Uses the gated composite score directly.
    """
    return score["score"]


def score_one(
    task: dict[str, Any], candidates: list[dict[str, Any]]
) -> dict[str, Any]:
    """Score one or more candidate outputs for a single task, keeping the best.

    Each candidate is scored independently against ground truth. The one
    with the highest ``_candidate_rank_key`` is returned.
    """
    if not candidates:
        raise ValueError("score_one requires at least one candidate")

    scored = [_score_candidate(task, c) for c in candidates]
    best = max(scored, key=_candidate_rank_key)

    best["task_id"] = candidates[0].get("task_id")
    best["difficulty"] = candidates[0].get("difficulty")
    best["n_candidates"] = len(candidates)

    return best


# ---------------------------------------------------------------------------
# Aggregates
# ---------------------------------------------------------------------------


def _verdict_counts(scores: list[dict[str, Any]]) -> dict[str, int]:
    tp = fp = fn = tn = 0
    for s in scores:
        gt = s["ground_truth_vulnerable"]
        pred = s["predicted_vulnerable"]
        if pred and gt:
            tp += 1
        elif pred and not gt:
            fp += 1
        elif not pred and gt:
            fn += 1
        else:
            tn += 1
    return {"tp": tp, "fp": fp, "fn": fn, "tn": tn}


def _safe_div(numerator: float, denominator: float) -> float | None:
    if denominator <= 0:
        return None
    return numerator / denominator


def _mean(values: list[float]) -> float | None:
    if not values:
        return None
    return sum(values) / len(values)


def compute_ece(
    scores: list[dict[str, Any]], bin_count: int = ECE_BIN_COUNT
) -> float | None:
    """Expected Calibration Error of confidence vs. verdict correctness.

    Uses ``bin_count`` equal-width bins on ``[0, 1]``. Returns ``None`` if
    ``scores`` is empty.
    """
    if not scores:
        return None
    bins: list[list[tuple[float, bool]]] = [[] for _ in range(bin_count)]
    for s in scores:
        confidence = float(s["confidence"])
        clamped = min(max(confidence, 0.0), 1.0)
        if clamped >= 1.0:
            bin_idx = bin_count - 1
        else:
            bin_idx = min(int(clamped * bin_count), bin_count - 1)
        bins[bin_idx].append((clamped, bool(s["verdict_correct"])))

    total = len(scores)
    ece = 0.0
    for bucket in bins:
        if not bucket:
            continue
        avg_conf = sum(c for c, _ in bucket) / len(bucket)
        accuracy = sum(1 for _, correct in bucket if correct) / len(bucket)
        ece += (len(bucket) / total) * abs(avg_conf - accuracy)
    return ece


def aggregate(scores: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate per-task scores into ECVEBench summary metrics."""
    n = len(scores)
    counts = _verdict_counts(scores)
    tp = counts["tp"]
    fp = counts["fp"]
    fn = counts["fn"]

    precision = _safe_div(tp, tp + fp)
    recall = _safe_div(tp, tp + fn)
    if precision is not None and recall is not None and (precision + recall) > 0:
        f1: float | None = 2 * precision * recall / (precision + recall)
    else:
        f1 = None

    composite_values = [s["score"] for s in scores]
    vuln_class_values = [
        1.0 if s["vuln_class_correct"] else 0.0
        for s in scores
        if s["vuln_class_correct"] is not None
    ]
    file_recall_values = [
        s["file_recall"] for s in scores if s["file_recall"] is not None
    ]
    function_iou_values = [
        s["function_iou"] for s in scores if s["function_iou"] is not None
    ]

    return {
        "n": n,
        "score": _mean(composite_values),
        "verdict": {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            **counts,
        },
        "vuln_class_accuracy": _mean(vuln_class_values),
        "vuln_class_n": len(vuln_class_values),
        "file_recall_mean": _mean(file_recall_values),
        "file_recall_n": len(file_recall_values),
        "function_iou_mean": _mean(function_iou_values),
        "function_iou_n": len(function_iou_values),
        "ece": compute_ece(scores),
        "ece_bin_count": ECE_BIN_COUNT,
    }


def aggregate_by_difficulty(
    scores: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Per-difficulty aggregates plus a single overall aggregate."""
    return {
        "overall": aggregate(scores),
        "by_difficulty": {
            difficulty: aggregate(
                [s for s in scores if s["difficulty"] == difficulty]
            )
            for difficulty in DIFFICULTIES
        },
    }


# ---------------------------------------------------------------------------
# CLI rendering
# ---------------------------------------------------------------------------


def _fmt(value: float | None, digits: int = 4) -> str:
    if value is None:
        return "n/a"
    return f"{value:.{digits}f}"


def _fmt_int(value: int | None) -> str:
    if value is None:
        return "n/a"
    return str(value)


def _format_summary(summary: dict[str, dict[str, Any]]) -> str:
    overall = summary["overall"]
    by_difficulty = summary["by_difficulty"]
    columns: tuple[tuple[str, dict[str, Any]], ...] = (
        ("Overall", overall),
        *((difficulty, by_difficulty[difficulty]) for difficulty in DIFFICULTIES),
    )

    label_width = 26
    column_width = 12

    def row(label: str, cells: Iterable[str]) -> str:
        formatted_cells = "".join(cell.rjust(column_width) for cell in cells)
        return f"{label.ljust(label_width)}{formatted_cells}"

    lines: list[str] = []
    lines.append("ECVEBench scorer summary")
    lines.append("=" * (label_width + column_width * len(columns)))
    lines.append(row("", (name for name, _ in columns)))
    lines.append(row("N tasks", (_fmt_int(agg["n"]) for _, agg in columns)))
    lines.append("")
    lines.append(
        row(
            "Score (mean)",
            (_fmt(agg["score"]) for _, agg in columns),
        )
    )
    lines.append("")
    lines.append("Verdict (gate)")
    lines.append(
        row(
            "  Precision",
            (_fmt(agg["verdict"]["precision"]) for _, agg in columns),
        )
    )
    lines.append(
        row(
            "  Recall",
            (_fmt(agg["verdict"]["recall"]) for _, agg in columns),
        )
    )
    lines.append(
        row(
            "  F1",
            (_fmt(agg["verdict"]["f1"]) for _, agg in columns),
        )
    )
    lines.append(
        row(
            "  TP/FP/FN/TN",
            (
                f"{agg['verdict']['tp']}/{agg['verdict']['fp']}/"
                f"{agg['verdict']['fn']}/{agg['verdict']['tn']}"
                for _, agg in columns
            ),
        )
    )
    lines.append("")
    lines.append(
        row(
            "Vuln class acc (gate)",
            (_fmt(agg["vuln_class_accuracy"]) for _, agg in columns),
        )
    )
    lines.append(
        row(
            "  (denominator)",
            (_fmt_int(agg["vuln_class_n"]) for _, agg in columns),
        )
    )
    lines.append(
        row(
            "File recall (mean)",
            (_fmt(agg["file_recall_mean"]) for _, agg in columns),
        )
    )
    lines.append(
        row(
            "  (denominator)",
            (_fmt_int(agg["file_recall_n"]) for _, agg in columns),
        )
    )
    lines.append(
        row(
            "Function IoU (diag)",
            (_fmt(agg["function_iou_mean"]) for _, agg in columns),
        )
    )
    lines.append(
        row(
            "  (denominator)",
            (_fmt_int(agg["function_iou_n"]) for _, agg in columns),
        )
    )
    lines.append(
        row(
            f"ECE ({ECE_BIN_COUNT} bins)",
            (_fmt(agg["ece"]) for _, agg in columns),
        )
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _group_outputs(
    outputs: list[dict[str, Any]], tasks: dict[str, dict[str, Any]]
) -> dict[tuple[str, str], list[dict[str, Any]]]:
    """Group outputs by ``(task_id, difficulty)``, keeping up to MAX_CANDIDATES per group."""
    groups: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for output in outputs:
        task_id = output.get("task_id")
        difficulty = output.get("difficulty")
        if task_id not in tasks:
            _emit_warning(
                f"output task_id {task_id!r} not found in tasks; skipping"
            )
            continue
        key = (task_id, difficulty)
        group = groups.setdefault(key, [])
        if len(group) >= MAX_CANDIDATES:
            _emit_warning(
                f"(task_id={task_id!r}, difficulty={difficulty!r}) has more "
                f"than {MAX_CANDIDATES} candidates; extras ignored"
            )
            continue
        group.append(output)
    return groups


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Score agent outputs against ECVEBench ground truth.",
    )
    parser.add_argument(
        "--tasks",
        type=Path,
        default=DEFAULT_TASKS_PATH,
        help=(
            "Path to tasks directory or JSONL file "
            f"(default: {DEFAULT_TASKS_PATH})."
        ),
    )
    parser.add_argument(
        "--outputs",
        type=Path,
        required=True,
        help="Path to agent outputs directory or JSONL file.",
    )
    parser.add_argument(
        "--results",
        type=Path,
        default=DEFAULT_RESULTS_PATH,
        help=(
            "Path to write the machine-readable JSON results "
            f"(default: {DEFAULT_RESULTS_PATH})."
        ),
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)

    tasks = index_tasks(load_records(args.tasks))
    outputs = load_records(args.outputs)
    groups = _group_outputs(outputs, tasks)

    scores = [
        score_one(tasks[task_id], candidates)
        for (task_id, _difficulty), candidates in sorted(groups.items())
    ]
    summary = aggregate_by_difficulty(scores)

    n_tasks_scored = len(groups)
    results = {
        "tasks_path": str(args.tasks),
        "outputs_path": str(args.outputs),
        "n_outputs_in_file": len(outputs),
        "n_tasks_scored": n_tasks_scored,
        "ece_bin_count": ECE_BIN_COUNT,
        "overall": summary["overall"],
        "by_difficulty": summary["by_difficulty"],
        "per_task": scores,
    }

    args.results.parent.mkdir(parents=True, exist_ok=True)
    with args.results.open("w") as f:
        json.dump(results, f, indent=2)
        f.write("\n")

    print(_format_summary(summary))
    print()
    print(
        f"Scored {n_tasks_scored} task(s) from {len(outputs)} output(s)."
    )
    print(f"Wrote results to {args.results}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
