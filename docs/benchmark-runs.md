# Benchmark Runs

The control plane owns benchmark orchestration. The CLI and dashboard call the same benchmark-run APIs.

## Required Control Plane Data

The benchmark task and metadata fixtures are checked into the repo and bundled with the control plane:

```text
benchmark/data/tasks.jsonl
benchmark/internal/metadata.jsonl
```

Do not copy the JSONL contents into `.dev.vars` or Worker secrets. Update the fixture files and redeploy the Worker when the dataset changes.

## API Flow

1. `GET /benchmark-tasks` lists task summaries.
2. `POST /benchmark-runs` creates and, by default, starts a run.
3. The orchestrator creates an agent session with benchmark config.
4. Forgejo target and run repositories are provisioned.
5. Modal checks out the vulnerable commit from the run repo.
6. The agent receives the rendered benchmark input.
7. The orchestrator parses the final agent JSON, scores it, writes `codebreaker-result.json`, commits artifacts, and records D1 rows.
8. `POST /benchmark-runs/:id/cleanup` terminates Modal and/or archives Forgejo according to the run cleanup policy.

## CLI

```bash
CODEBREAKER_API_URL=http://localhost:8787 \
CODEBREAKER_TOKEN=<jwt> \
pnpm --dir packages/benchmark-runner benchmark list

CODEBREAKER_API_URL=http://localhost:8787 \
CODEBREAKER_TOKEN=<jwt> \
pnpm --dir packages/benchmark-runner benchmark run \
  --task ecvebench-electerm-001 \
  --difficulty L1 \
  --model anthropic/claude-sonnet-4-5
```

## Validation

Run fixture validation locally:

```bash
pnpm --dir packages/benchmark-runner validate:fixtures
```

For a live smoke test, configure Forgejo, Modal, model credentials, and JWT auth, then create a run from the dashboard or CLI.
