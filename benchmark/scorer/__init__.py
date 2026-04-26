"""ECVEBench scorer: compare agent outputs against ground truth tasks."""

from .score import (
    aggregate,
    aggregate_by_difficulty,
    compute_ece,
    load_records,
    score_one,
    set_iou,
    set_recall,
)

__all__ = [
    "aggregate",
    "aggregate_by_difficulty",
    "compute_ece",
    "load_records",
    "score_one",
    "set_iou",
    "set_recall",
]
