# Benchmark Runs

The control plane owns benchmark orchestration. The CLI and dashboard call the same benchmark-run APIs.

## Required Control Plane Data

The benchmark task and metadata fixtures are checked into the repo and bundled with the control plane:

```text
benchmark/data/tasks/*.json
benchmark/internal/metadata/*.json
```

Do not copy fixture contents into `.dev.vars` or Worker secrets. Update the fixture files and redeploy the Worker when the dataset changes.

## API Flow

1. `GET /benchmark-tasks` lists task summaries.
2. `POST /benchmark-runs` creates and, by default, starts a run.
3. The orchestrator creates an agent session with benchmark config.
4. A GitHub target snapshot repository is created or reused for the benchmark commit.
5. Modal checks out the vulnerable commit from the target snapshot repo.
6. The agent receives the rendered benchmark input.
7. The orchestrator parses the final agent JSON, scores it, and records queryable result/evidence rows in D1.
8. `POST /benchmark-runs/:id/cleanup` terminates Modal and archives only true per-run repositories when one exists.

## CLI

```bash
CODEBREAKER_API_URL=http://localhost:8787 \
CODEBREAKER_TOKEN=<jwt> \
pnpm --dir packages/benchmark-runner benchmark list

CODEBREAKER_API_URL=http://localhost:8787 \
CODEBREAKER_TOKEN=<jwt> \
pnpm --dir packages/benchmark-runner benchmark run \
  --task ecvebench-filebrowser-001 \
  --difficulty L1 \
  --model anthropic/claude-sonnet-4-5
```

## Validation

Run fixture validation locally:

```bash
pnpm --dir packages/benchmark-runner validate:fixtures
```

For a live smoke test, configure GitHub, Modal, model credentials, and JWT auth, then create a run from the dashboard or CLI.

## Result Persistence

GitHub stores durable target source snapshots only. A target repo name includes the benchmark ID and vulnerable commit prefix, so the control plane can reuse a snapshot when the same benchmark SHA is requested again. When an existing target repo is found, the GitHub provider verifies that the vulnerable and patched refs are present before using it.

D1 is the canonical store for per-run output. The full agent JSON and score JSON are retained for audit/debug, and important fields are also extracted into queryable columns. Predicted locations are stored one row per location in `benchmark_run_locations` for dashboard filtering and analysis.
