# Cybersecurity Agent Harness

This document records the current boundary between the Cloudflare Think harness
and the reusable benchmark-agent pieces.

## Runtime Harness

`packages/control-plane/src/session/agent.ts` owns the Think Durable Object. It
selects the model, configures session context, assembles active tools, tracks
budgets, and exposes callable lifecycle methods such as `init`,
`requestFollowUp`, and `enableBenchmarkSubmitMode`.

`packages/control-plane/src/benchmarks/orchestrator.ts` owns live benchmark
orchestration: create the session, check out the target artifact, run the
exploration turn, request a submission turn when needed, score candidates, and
persist run state.

## Reusable Agent Core

`packages/benchmark-runner/src/agent-core/prompts.ts` owns portable prompt
rendering. It produces the system prompt, initial prompt, and structured
context blocks for Think and direct frontier-model runs.

`packages/benchmark-runner/src/agent-core/tools.ts` owns the portable tool
capability manifest. Think tool names are mapped to abstract capabilities so
direct runners and future adapters can share one vocabulary for basic tools.

`packages/benchmark-runner/src/agent-core/output.ts` owns raw assistant output
normalization into `AgentOutput` candidates.

`packages/benchmark-runner/src/agent-core/direct-runner.ts` owns harness-free
frontier-model evaluation. It renders the same prompt pack, calls the selected
model directly, parses output candidates, and scores them with the existing
benchmark scoring contract.

## Shared Contracts

`packages/benchmark-runner/src/schemas.ts` remains the source of truth for task
projection, agent input/output schemas, run request schemas, and scoring.

`packages/shared/src/lib/models.ts` remains the provider/model catalog used by
the dashboard, control plane, and direct runner.

`packages/shared/src/schemas/session.ts` remains the Think session config
contract used by the control plane and dashboard.

## Tool Implementations

`packages/control-plane/src/tools/builtins.ts` adapts the portable capability
manifest into Think tool sets and policy-filtered active tool names.

`packages/control-plane/src/tools/deepwiki.ts`, `http.ts`, `modal.ts`, and
`benchmark-submit.ts` own the concrete server-side tool implementations.

`packages/control-plane/src/tools/tiers.ts` owns policy enforcement tiers for
the Think runtime.
