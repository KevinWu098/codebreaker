# Forgejo Benchmark Artifact Flow

Codebreaker stores benchmark artifacts in Git-backed repositories managed by the control plane. Forgejo is the active provider while Cloudflare Artifacts remains a future provider behind the same `GitTreeStore` interface.

## Storage Boundaries

- Forgejo owns canonical artifact storage as bare Git repositories.
- The control plane owns repository provisioning, short-lived operation credentials, and D1 metadata.
- `SessionAgent` owns durable agent state and exposes the current artifact state to the model as Think context.
- Modal sandboxes only hold working checkouts under `/workspace`; they are not canonical storage.

## Repository Lifecycle

Each benchmark target has a stable target repository. The control plane creates or reuses it from `config.benchmark.target`, importing from `sourceUrl` when provided.

Each session gets a per-run repository. The run repo is seeded from the stable target when Forgejo migration can read it; otherwise it is created empty and the checkout/commit flow still works against the run repo.

Agents write exploit code, validation scripts, reports, and evidence only to the per-run checkout. Final paths, run command, commit SHA, and status are mirrored into `SessionAgent` state and D1.

## Credential Flow

Forgejo credentials are never stored in D1, Think context, model-visible messages, or pushed files. The Worker reads the Forgejo service token from environment secrets and returns an operation credential only when an artifact route needs to clone or push.

Modal receives the credential in the `/git/checkout` or `/git/commit` request. The shim passes it to Git through `http.extraHeader`, resets the remote URL to the clean clone URL, and avoids persisting credentials in `.git/config`.

## Session Flow

1. `POST /sessions` validates `config.benchmark`.
2. The control plane ensures the stable target repo exists.
3. The control plane creates or reuses the per-run repo.
4. The initial `BenchmarkArtifactState` is stored in the agent and D1.
5. `POST /sessions/:id/artifacts/checkout` clones or refreshes the run repo in Modal.
6. The agent writes benchmark artifacts in that checkout.
7. `POST /sessions/:id/artifacts/commit` commits and pushes generated files.
8. The control plane records the latest commit SHA and artifact status.

## Local Configuration

Set these Worker env vars or secrets for Forgejo-backed artifacts:

```text
GIT_TREE_PROVIDER=forgejo
FORGEJO_BASE_URL=https://forgejo.example.com
FORGEJO_TOKEN=<service-account-token>
FORGEJO_OWNER=<user-or-org>
FORGEJO_USERNAME=git
```

The service token needs repository read/write scope and enough permission to create or migrate repositories for the configured owner.
# Artifacts Benchmark Flow

Cloudflare Artifacts is the durable Git-backed storage layer for benchmark code and work product. Agents and sandboxes do not own the canonical files.

## Storage Boundaries

- Artifacts stores stable target repos, per-run repos, exploit files, validation scripts, evidence, reports, and Git history.
- Think/Agents stores orchestration state: repo names, remotes, branches, commit SHAs, artifact paths, run commands, and validation status.
- Modal sandboxes are disposable execution environments. They clone a per-run repo into `/workspace/<repo>`, execute commands, then push results back.
- D1 stores only searchable/indexable metadata for listing sessions and benchmark results.

## Repository Lifecycle

1. Import or create a stable target repo for each benchmark target.
2. Treat the stable target repo as the reviewed baseline for source, vulnerable/patched refs, setup notes, and validation criteria.
3. On session creation, fork or reuse a per-run Artifacts repo for the specific benchmark/session/agent.
4. The control plane records the per-run repo metadata in the agent state and D1.
5. The sandbox checks out the per-run repo before execution.
6. The agent writes exploit artifacts and evidence into the checkout.
7. The sandbox commits and pushes the result back to Artifacts.
8. The agent records final paths, commands, status, and commit SHA.

## Token Lifecycle

Artifacts Git tokens are repo-scoped and short-lived. They are not Cloudflare API tokens and should not be persisted.

- Use read tokens for clone/fetch/review operations.
- Use write tokens for checkout/update and commit/push operations.
- Mint tokens just in time from the Worker binding.
- If a long-running agent needs Git access after a token expires, mint a fresh token and retry the operation.
- Do not store tokens in D1, Think context, model-visible prompts, Artifacts files, or persistent logs.

## Reproducing A Result

A completed benchmark should be reproducible from:

- `runRepoName`
- `runRepoRemote`
- `artifactWorkingBranch`
- `artifactLatestCommitSha`
- `artifactPath`
- `runCommand`

Clone the run repo with a fresh read token, check out the recorded commit SHA, and run the recorded command in the expected sandbox profile.
