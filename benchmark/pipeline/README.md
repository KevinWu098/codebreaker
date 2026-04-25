# Curation Pipeline

Scripts for filtering GitHub Security Advisories and dispatching them to Devin agents for full curation. See [docs/curation.md](../docs/curation.md) for the methodology behind the selection criteria and curation process.

## Overview

The pipeline has two stages:

1. **Filter** — `filter_advisories.py` paginates through all reviewed GHSAs via the GitHub REST API and applies metadata-only filters. No repos are cloned, no diffs are read. Produces a JSONL candidate list.
2. **Curate** — Each candidate GHSA is dispatched to a Devin AI agent, which clones the repo, reads the diff, classifies the vulnerability, localizes it, and opens a PR with the task and metadata JSON files.

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
uv run python -m pipeline.filter_advisories
```

Options:

| Flag | Default | Description |
|------|---------|-------------|
| `--output` | `pipeline/output/filtered.jsonl` | Path to write filtered candidates |
| `--checkpoint` | `pipeline/output/filter_checkpoint.json` | Checkpoint for resumption |
| `--max-pages` | all | Stop after N pages (100 advisories/page) |

The script applies these filters using only advisory metadata:

- Has a non-empty description
- Description is English (ASCII ratio >= 85%)
- Affects exactly one package
- Has at least one commit, PR, or tag reference URL
- Has a CVSS score
- No duplicate GHSA IDs

Output is one JSON object per line with fields: `ghsa_id`, `cve_id`, `severity`, `cvss`, `cwe_ids`, `ecosystem`, `summary`, `published_at`.

The script checkpoints after each page, so you can interrupt and resume.

## Step 2: Dispatch to Devin

Each filtered GHSA is sent to a Devin agent with the prompt template at [`docs/prompts/curation_agent.md`](../docs/prompts/curation_agent.md). The agent opens a PR containing:

- `benchmark/data/tasks/{task_id}.json`
- `benchmark/internal/metadata/{GHSA_ID}.json`

See `scratch/smoke_test_devin.py` for an example of how to call the Devin API.

## Directory structure

```
pipeline/
├── README.md
├── __init__.py
├── filter_advisories.py       # step 1: filter GHSAs
└── lib/
    ├── __init__.py
    ├── filters.py             # filter functions and metadata extractors
    └── github_client.py       # GitHub REST API client with rate-limit handling
```

Runtime artifacts (gitignored):
- `output/` — `filtered.jsonl`, checkpoints
- `scratch/` — throwaway experiments, smoke tests
