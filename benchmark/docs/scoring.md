# Scoring

ECVEBench uses **gated scoring** with file-level location recall as the primary metric. This document is the authoritative reference for the scoring methodology.

## Why Gated Scoring?

Empirically, current models almost always correctly detect whether a vulnerability exists (the `vulnerable` field). Weighting this component would inflate every score without adding discriminative signal. Similarly, vulnerability class identification is a prerequisite for meaningful localization — if the agent misclassifies the vulnerability type, its location predictions are unreliable.

## Scoring Formula

```
if vulnerable verdict is wrong → score = 0
otherwise                      → score = 0.3 × vuln_class_correct + 0.7 × location_recall
```

Where:

- `vuln_class_correct` is 1 if the predicted class matches ground truth, 0 otherwise
- `location_recall` incorporates both exact and sibling file matches:

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

## Why Recall Instead of IoU?

Agents typically predict a small number of locations (1–3 files), so the risk of inflating scores by predicting many files is low. In a security triage workflow, false positives are cheap (a reviewer can quickly dismiss irrelevant files) while false negatives are expensive (missing the actual vulnerable code). Recall captures this asymmetry.

## What Is Scored

| Field              | Method                                                    |
| ------------------ | --------------------------------------------------------- |
| `vulnerable`       | Binary gate. Incorrect verdict → score 0.                 |
| `vuln_class`       | Weighted at 30%. Exact match contributes 0.3.             |
| `locations.file`   | Weighted at 70%. Recall against ground truth file set, with sibling credit. |

## What Is NOT Scored (and Why)

| Field                | Purpose                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `locations.function` | Required in agent output to force deeper analysis, but not directly scored. Used to determine sibling credit (predicted files must share a function name with ground truth). |
| `sibling_file_hits`  | Diagnostic. Number of predicted files that received discounted sibling credit. Reported for analysis.        |
| `reason`             | Reference only. Used for qualitative analysis of failure cases.                                              |
| `confidence`         | Expected Calibration Error (ECE) is reported separately by the offline scorer as a diagnostic axis.          |

## Multi-Candidate Scoring (Oracle Best)

An agent may return up to **3** candidate vulnerability hypotheses per task. The scorer evaluates each candidate independently and keeps the **oracle-best** — the one with the highest composite score. This reduces noise from agents that find a real but unrelated vulnerability alongside the target one.

- **Online (TS) scorer**: the agent's raw output is scanned for up to 3 valid JSON objects matching the `AgentOutput` schema. Each is scored; the best is persisted as the run result.
- **Offline (Python) scorer**: multiple JSONL lines with the same `(task_id, difficulty)` are treated as candidates for the same task. Up to 3 per group are scored; the best is kept.

Single-candidate outputs work identically — no changes needed for agents that return one response.

## Aggregate Benchmark Score

The overall benchmark score for a model is the **mean per-task score** across all evaluated tasks at a given difficulty:

```
benchmark_score = mean(per_task_scores)
```

This is equivalent to a partial-credit pass rate — tasks where the gate passes contribute their weighted class + location score, and tasks where the gate fails contribute 0.

## Diagnostic Metrics

The scorer also reports the following diagnostic metrics that do not affect the composite score:

| Metric                  | Description                                                              |
| ----------------------- | ------------------------------------------------------------------------ |
| Verdict precision/recall/F1 | Binary classification metrics for vulnerability detection.           |
| Function IoU            | Mean function-level IoU for matched files. Reported for analysis only.   |
| ECE (10 bins)           | Expected Calibration Error of confidence vs. verdict accuracy.           |

## Running the Scorer

See [`scorer/README.md`](../scorer/README.md) for CLI and library usage.
