"""ECVEBench scorer: compare agent outputs against ground truth tasks."""

from .score import (
    aggregate,
    compute_ece,
    load_records,
    score_one,
    set_iou,
)

__all__ = [
    "aggregate",
    "compute_ece",
    "load_records",
    "score_one",
    "set_iou",
]
