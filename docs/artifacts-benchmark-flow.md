# GitHub Benchmark Artifact Flow

Codebreaker stores benchmark target snapshots in GitHub and benchmark run output in D1. The GitHub implementation uses the REST API to create or reuse durable target repositories through the `GitTreeStore` interface.

## Storage Boundaries

- GitHub owns canonical target source snapshots.
- The control plane owns repository provisioning, short-lived operation credentials, and D1 metadata.
- `SessionAgent` owns durable agent state and exposes the current artifact state to the model as Think context.
- Modal sandboxes only hold working checkouts under `/workspace`; they are not canonical storage.
- D1 owns per-run benchmark output and queryable evidence.

## Repository Lifecycle

Each benchmark target commit has a stable target repository. The control plane creates or reuses it from `config.benchmark.target`. Target repo names include the benchmark ID and vulnerable commit prefix so a run can check whether the required snapshot already exists.

If `sourceUrl` points at a public GitHub repository, the stable target is created by forking that upstream into the configured GitHub user/org. Before reusing an existing target repo, the provider verifies that the required vulnerable and patched refs are present.

Benchmark agents inspect the target checkout read-only. Parsed results, raw output, score components, and predicted locations are written to D1. A writable per-run repository is only needed for future tasks that require generated code, patches, repro scripts, or reviewable evidence files.

## Credential Flow

GitHub credentials (typically a personal access token) are never stored in D1, Think context, model-visible messages, or pushed files. The Worker reads the token from environment secrets and returns an operation credential only when an artifact route needs to clone or push.

Modal receives the credential in the `/git/checkout` or `/git/commit` request. The shim passes it to Git through `http.extraHeader`, resets the remote URL to the clean clone URL, and avoids persisting credentials in `.git/config`.

## Session Flow

1. `POST /sessions` validates `config.benchmark`.
2. The control plane ensures the stable target repo exists.
3. The control plane creates or reuses the stable target repo for the vulnerable commit.
4. The initial `BenchmarkArtifactState` is stored in the agent and D1.
5. Modal clones or refreshes the target repo in Modal at the vulnerable commit.
6. The agent inspects the checkout and returns benchmark JSON.
7. The control plane records result JSON, extracted columns, score components, and predicted locations in D1.

## Local Configuration

Set these Worker env vars or secrets for GitHub-backed artifacts:

```text
GIT_TREE_PROVIDER=github
GITHUB_TOKEN=<github-token>
# Prefer a GitHub org as the owner namespace for forks/repos:
GITHUB_ORG=<org-login>
# If you are not using an org, set a user account instead:
GITHUB_OWNER=<user-login>

# Optional: username used in HTTPS git Basic auth (many setups use "x-access-token")
GITHUB_GIT_USERNAME=x-access-token
```

The token must be able to create private repositories, fork upstream repositories, archive repositories, and read/write `git` over HTTPS.
