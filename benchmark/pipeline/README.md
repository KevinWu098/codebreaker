# Curation Pipeline

Scripts for filtering, selecting, and dispatching GitHub Security Advisories to Devin agents for full curation. See [docs/curation.md](../docs/curation.md) for the methodology behind the selection criteria and curation process.

## Overview

The pipeline has three stages:

1. **Filter** — `filter_advisories.py` paginates through all reviewed GHSAs via the GitHub REST API and applies metadata-only filters. No repos are cloned, no diffs are read.
2. **Select** — `select_candidates.py` maps CWEs to the 13 vulnerability classes, applies a CVSS floor, and performs stratified random sampling for a balanced dispatch list.
3. **Dispatch** — `dispatch_devin.py` sends each selected candidate to a Devin AI agent with a fully populated prompt. The agent clones the repo, reads the diff, localizes the vulnerability, and opens a PR.

## Prerequisites

```bash
cd benchmark
uv sync
```

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `GITHUB_TOKEN` | GitHub personal access token (public repo read) |
| `DEVIN_API_KEY` | Devin API key |
| `DEVIN_ORG_ID` | Devin organization ID |
| `DEVIN_USER_ID` | Devin user ID for session attribution |
| `DEVIN_REPO` | Target repository (e.g. `owner/repo`) |

## Step 1: Filter advisories

```bash
uv run python -m pipeline.filter_advisories
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
| `--preserve` | (none) | Directory of existing task JSON files whose GHSAs are pinned in the output |
| `--target` | 500 | Target number of final benchmark tasks |
| `--overprovision` | 2.5 | Multiplier for expected Devin rejection rate |
| `--cvss-floor` | 4.0 | Minimum CVSS score (0 to disable) |
| `--seed` | 42 | Random seed for reproducibility |

Selection logic:

1. Dedup overlapping filter runs
2. Map CWE IDs → 13 vulnerability classes (via `lib/cwe_map.py`)
3. Drop advisories with no CWE, unmappable CWEs, or CVSS below floor
4. If `--preserve` is set, pin those GHSAs in the output and subtract their per-class counts from the sampling target
5. Stratified sample: up to `ceil(total_target / 13) - preserved_per_class` from each class

When scaling the dataset while preserving already-curated tasks:

```bash
uv run python -m pipeline.select_candidates --preserve data/tasks --target 500 --overprovision 1.0
```

## Step 3: Dispatch to Devin

```bash
uv run python -m pipeline.dispatch_devin --count 10
```

| Flag | Default | Description |
|------|---------|-------------|
| `--input` | `output/candidates.jsonl` | Input from Step 2 |
| `--count` | (required) | Number of candidates to dispatch |
| `--offset` | 0 | Skip first N candidates (for batched dispatch) |
| `--dry-run` | off | Render prompts without calling the API |
| `--recurate` | off | Re-curation mode: agents overwrite existing task/metadata files instead of checking for duplicates |
| `--branch` | (none) | Shared branch name (all agents in a batch commit here instead of per-task branches) |
| `--delay` | 2.0 | Seconds between API calls |

Each candidate's pre-computed fields (vulnerability class, CVSS, CVE ID, CWE IDs, ecosystem) are injected into the prompt template at [`docs/prompts/curation_agent.md`](../docs/prompts/curation_agent.md). The agent opens a PR containing:

- `benchmark/data/tasks/{task_id}.json`
- `benchmark/internal/metadata/{GHSA_ID}.json`

### Re-curating existing tasks

To re-curate tasks that already exist (e.g., after updating the curation prompt), use `--recurate` with `--branch`:

```bash
# Build a JSONL of just the existing GHSAs to re-curate
# Then dispatch in batches of 10 with shared branches
uv run python -m pipeline.dispatch_devin \
    --input output/recurate_existing.jsonl \
    --count 10 --offset 0 \
    --branch recurate/batch-01 \
    --recurate
```

The `--recurate` flag tells agents to skip the duplicate check and overwrite existing files in place, keeping the same task ID.

## Directory structure

```
pipeline/
├── README.md
├── __init__.py
├── filter_advisories.py       # step 1: filter GHSAs
├── select_candidates.py       # step 2: CWE mapping + stratified sampling
├── dispatch_devin.py          # step 3: send candidates to Devin agents
└── lib/
    ├── __init__.py
    ├── cwe_map.py             # CWE → vulnerability class lookup table
    ├── env.py                 # environment variable helpers
    ├── filters.py             # filter functions and metadata extractors
    └── github_client.py       # GitHub REST API client with rate-limit handling
```

Runtime artifacts (gitignored):
- `output/` — `filtered.jsonl`, `candidates.jsonl`, checkpoints, rejection logs
- `scratch/` — throwaway experiments
