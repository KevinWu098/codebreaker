# Curation Pipeline

Scripts for filtering, selecting, and dispatching GitHub Security Advisories to Devin agents for full curation. See [docs/curation.md](../docs/curation.md) for the methodology behind the selection criteria and curation process.

## Overview

The pipeline has three stages:

1. **Filter** — `filter_advisories.py` paginates through all reviewed GHSAs via the GitHub REST API and applies metadata-only filters. No repos are cloned, no diffs are read.
2. **Select** — `select_candidates.py` maps CWEs to the 13 vulnerability classes, applies a CVSS floor, and performs stratified random sampling for a balanced dispatch list.
3. **Curate** — Each selected GHSA is dispatched to a Devin AI agent, which clones the repo, reads the diff, classifies the vulnerability, localizes it, and opens a PR with the task and metadata JSON files.

## Prerequisites

```bash
cd benchmark
uv sync
```

You need a GitHub personal access token with public repo read access:

```bash
export GITHUB_TOKEN=ghp_...
```

## Step 1: Filter advisories

```bash
GITHUB_TOKEN=ghp_... uv run python -m pipeline.filter_advisories
```

| Flag | Default | Description |
|------|---------|-------------|
| `--output` | `output/filtered.jsonl` | Filtered candidates JSONL |
| `--rejected` | `output/rejected.jsonl` | Rejected advisories with reasons |
| `--checkpoint` | `output/filter_checkpoint.json` | Checkpoint for resumption |
| `--max-pages` | all | Stop after N pages (100 advisories/page) |

Filters applied (metadata only):

- Has a non-empty description
- Description is English (ASCII ratio >= 85%)
- Affects exactly one package
- Has at least one commit, PR, or tag reference URL
- Has a CVSS score
- No duplicate GHSA IDs

The script checkpoints after each page, so you can interrupt and resume.

## Step 2: Select candidates

```bash
uv run python -m pipeline.select_candidates
```

| Flag | Default | Description |
|------|---------|-------------|
| `--input` | `output/filtered.jsonl` | Input from Step 1 |
| `--output` | `output/candidates.jsonl` | Selected candidates for Devin |
| `--rejected` | `output/select_rejected.jsonl` | Rejected candidates with reasons |
| `--target` | 500 | Target number of final benchmark tasks |
| `--overprovision` | 2.5 | Multiplier for expected Devin rejection rate |
| `--cvss-floor` | 4.0 | Minimum CVSS score (0 to disable) |
| `--seed` | 42 | Random seed for reproducibility |

Selection logic:

1. Dedup overlapping filter runs
2. Map CWE IDs → 13 vulnerability classes (via `lib/cwe_map.py`)
3. Drop advisories with no CWE, unmappable CWEs, or CVSS below floor
4. Stratified sample: up to `ceil(target × overprovision / 13)` per class

## Step 3: Dispatch to Devin

Each selected GHSA is sent to a Devin agent with the prompt template at [`docs/prompts/curation_agent.md`](../docs/prompts/curation_agent.md). The agent opens a PR containing:

- `benchmark/data/tasks/{task_id}.json`
- `benchmark/internal/metadata/{GHSA_ID}.json`

See `scratch/smoke_test_devin.py` for an example of how to call the Devin API.

## Directory structure

```
pipeline/
├── README.md
├── __init__.py
├── filter_advisories.py       # step 1: filter GHSAs
├── select_candidates.py       # step 2: CWE mapping + stratified sampling
└── lib/
    ├── __init__.py
    ├── cwe_map.py             # CWE → vulnerability class lookup table
    ├── filters.py             # filter functions and metadata extractors
    └── github_client.py       # GitHub REST API client with rate-limit handling
```

Runtime artifacts (gitignored):
- `output/` — `filtered.jsonl`, `candidates.jsonl`, checkpoints, rejection logs
- `scratch/` — throwaway experiments, smoke tests
