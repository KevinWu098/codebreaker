"""Render an ECVEBench agent input from a task record.

Following CyberGYM's pattern, ECVEBench stores one record per unique
vulnerability (GHSA). Difficulty is a runtime parameter: this module
projects a task record into a difficulty-specific agent input that
contains exactly one hint and no ground truth.

Usage as a library:

    from benchmark.harness import generate_input, load_task
    task = load_task(Path("benchmark/data/tasks"), "ecvebench-electerm-001")
    agent_input = generate_input(task, "L1")

Usage as a script:

    python benchmark/harness/generate_input.py \\
        --task-id ecvebench-electerm-001 --difficulty L1
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Literal

Difficulty = Literal["L0", "L1", "L2", "L3"]
DIFFICULTIES: tuple[Difficulty, ...] = ("L0", "L1", "L2", "L3")

DEFAULT_TASKS_PATH = Path(__file__).resolve().parent.parent / "data" / "tasks"


def generate_input(task: dict[str, Any], difficulty: Difficulty) -> dict[str, Any]:
    """Project a task record into an agent input at the given difficulty.

    The task record stores all hint variants in ``hints[L0|L1|L2|L3]``. The
    agent input projects exactly one of those into a single ``hint`` field
    and drops ``ghsa_id`` and ``ground_truth``, which the agent must not see.
    """
    hints = task.get("hints")
    if not isinstance(hints, dict) or difficulty not in hints:
        raise ValueError(
            f"Task {task.get('task_id')!r} has no hint entry for difficulty "
            f"{difficulty!r}"
        )
    return {
        "task_id": task["task_id"],
        "difficulty": difficulty,
        "codebase": task["codebase"],
        "hint": hints[difficulty],
    }


def load_task(tasks_path: Path, task_id: str) -> dict[str, Any]:
    """Load a single task record by ``task_id``.

    Accepts either a directory of ``*.json`` files (looks for
    ``{task_id}.json``) or a JSONL file (scans lines for matching id).
    """
    if tasks_path.is_dir():
        filepath = tasks_path / f"{task_id}.json"
        if not filepath.exists():
            raise KeyError(f"Task {task_id!r} not found in {tasks_path}")
        with filepath.open() as f:
            return json.load(f)

    with tasks_path.open() as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line:
                continue
            record = json.loads(line)
            if record.get("task_id") == task_id:
                return record
    raise KeyError(f"Task {task_id!r} not found in {tasks_path}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Render an ECVEBench agent input from a task record."
    )
    parser.add_argument("--task-id", required=True, help="GHSA-level task identifier.")
    parser.add_argument(
        "--difficulty",
        required=True,
        choices=list(DIFFICULTIES),
        help="Difficulty level to render.",
    )
    parser.add_argument(
        "--tasks",
        type=Path,
        default=DEFAULT_TASKS_PATH,
        help=f"Path to tasks directory or JSONL file (default: {DEFAULT_TASKS_PATH}).",
    )
    args = parser.parse_args(argv)

    task = load_task(args.tasks, args.task_id)
    agent_input = generate_input(task, args.difficulty)
    json.dump(agent_input, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
