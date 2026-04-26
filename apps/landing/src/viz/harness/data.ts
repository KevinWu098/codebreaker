// All values in this file are pulled from the actual harness code:
// - packages/control-plane/wrangler.jsonc, types.ts
// - packages/control-plane/src/sandbox/modal.ts
// - packages/control-plane/src/audits/{shards.ts,prompts.ts,coordinator-tools.ts,orchestrator.ts}
// - packages/control-plane/src/benchmarks/orchestrator.ts
// - packages/control-plane/src/cve-followup/orchestrator.ts
// - packages/control-plane/src/tools/{builtins.ts,tiers.ts}
// - packages/benchmark-runner/src/agent-core/{prompts.ts,tools.ts}
// - packages/benchmark-runner/src/schemas.ts
// - packages/modal-shim/src/codebreaker_modal_shim/main.py
// - packages/shared/src/lib/models.ts
// - packages/shared/src/data/sandbox-profiles.json
// - packages/shared/src/schemas/audits.ts

export interface PlatformLayer {
  blurb: string;
  bullets: string[];
  id: "edge" | "compute";
  name: string;
  vendor: string;
}

export const PLATFORM_LAYERS: PlatformLayer[] = [
  {
    id: "edge",
    name: "Control plane",
    vendor: "Cloudflare",
    blurb:
      "A single Worker (codebreaker-control-plane) holds the state machine. Every long-lived agent run is a Durable Object; every result row lives in D1.",
    bullets: [
      "Worker · routes, auth, run lifecycle",
      "D1 · run / event / finding tables",
      "4 Durable Object classes · agent runtimes",
      "Worker Loader · sandboxed execute tool",
      "Cron · */2 * * * * watchdog",
      "Smart placement · nodejs_compat",
    ],
  },
  {
    id: "compute",
    name: "Data plane",
    vendor: "Modal",
    blurb:
      "A FastAPI service (codebreaker-modal-shim) runs on Modal. It owns sandbox provisioning, command execution, file IO, and git checkouts. The Worker speaks to it over signed HTTP.",
    bullets: [
      "FastAPI shim · bearer-auth, idempotent POSTs",
      "9 sandbox profiles · per-language images",
      "/exec · 15-second cap per call",
      "/exec/stream · streamed long-running output",
      "/read · /write · bounded file IO",
      "/git/checkout · /git/commit · /snapshot · /terminate",
    ],
  },
];

export interface DurableObjectRole {
  binding: string;
  blurb: string;
  className: string;
  role: string;
}

// Verified against control-plane/wrangler.jsonc + types.ts.
export const DURABLE_OBJECTS: DurableObjectRole[] = [
  {
    binding: "SESSION_AGENT",
    className: "SessionAgent",
    role: "Benchmark / Think session",
    blurb:
      "Cloudflare Think session. Drives one ECVEBench task end-to-end with the active tool set.",
  },
  {
    binding: "AUDIT_COORDINATOR",
    className: "AuditCoordinatorAgent",
    role: "Audit orchestrator",
    blurb:
      "Plans shards, dispatches investigators and validators, finalizes the audit.",
  },
  {
    binding: "AUDIT_INVESTIGATOR",
    className: "AuditInvestigatorAgent",
    role: "Audit subagent",
    blurb:
      "One per shard. Hunts a single attack surface and submits candidate findings.",
  },
  {
    binding: "AUDIT_VALIDATOR",
    className: "AuditValidatorAgent",
    role: "Audit verifier",
    blurb:
      "One per candidate. Re-checks evidence and confirms or dismisses the finding.",
  },
];

export interface Toolkit {
  blurb: string;
  id: string;
  kind: "capability" | "skill" | "prompt";
  label: string;
}

// 11 capabilities from packages/benchmark-runner/src/agent-core/tools.ts
// (TOOL_CAPABILITIES). Risk tiers are filtered per-run by ExtensionPolicy
// (packages/control-plane/src/tools/tiers.ts).
export const TOOLKIT: Toolkit[] = [
  {
    id: "workspace_read",
    label: "workspace_read",
    kind: "capability",
    blurb: "find · grep · list · read against the local checkout.",
  },
  {
    id: "workspace_write",
    label: "workspace_write",
    kind: "capability",
    blurb: "delete · edit · write inside the agent workspace.",
  },
  {
    id: "session_memory_read",
    label: "session_memory_read",
    kind: "capability",
    blurb: "load_context · search_context against Think durable session state.",
  },
  {
    id: "session_memory_write",
    label: "session_memory_write",
    kind: "capability",
    blurb: "set_context to persist scoped notes for the session.",
  },
  {
    id: "local_execute",
    label: "local_execute",
    kind: "capability",
    blurb: "execute via the Cloudflare Think workspace runtime.",
  },
  {
    id: "remote_execute",
    label: "remote_execute",
    kind: "capability",
    blurb: "exec_remote in the Modal sandbox. 15-second cap per call.",
  },
  {
    id: "remote_file_read",
    label: "remote_file_read",
    kind: "capability",
    blurb: "remote_read with bounded output for files inside the sandbox.",
  },
  {
    id: "remote_file_write",
    label: "remote_file_write",
    kind: "capability",
    blurb: "remote_write for scoped file edits inside the sandbox.",
  },
  {
    id: "deepwiki_orientation",
    label: "deepwiki_orientation",
    kind: "capability",
    blurb:
      "deepwiki_ask_question / read_contents / read_structure for repo orientation.",
  },
  {
    id: "public_http_fetch",
    label: "public_http_fetch",
    kind: "capability",
    blurb: "http_fetch with private/local network targets blocked.",
  },
  {
    id: "benchmark_submission",
    label: "benchmark_submission",
    kind: "capability",
    blurb: "submit_benchmark_result — the only schema-validated exit path.",
  },

  // 7 skills from BENCHMARK_SKILLS_CONTEXT in benchmark-runner prompts.
  {
    id: "repo_orientation",
    label: "repo_orientation",
    kind: "skill",
    blurb:
      "Identify language, manifests, entry points, and helpers before deep inspection.",
  },
  {
    id: "source_sink_analysis",
    label: "source_sink_analysis",
    kind: "skill",
    blurb:
      "Map untrusted-input boundaries to dangerous sinks. Hold 1–3 candidate pairs.",
  },
  {
    id: "scope_discipline",
    label: "scope_discipline",
    kind: "skill",
    blurb:
      "Treat hint phrasing as a compass. Don't reject candidates on naming alone.",
  },
  {
    id: "variant_coverage",
    label: "variant_coverage",
    kind: "skill",
    blurb:
      "When a pattern repeats across siblings, grep the directory and spot-check 3–5.",
  },
  {
    id: "budget_efficiency",
    label: "budget_efficiency",
    kind: "skill",
    blurb:
      "Prefer tool calls over extended reasoning. Enumerate before narrowing.",
  },
  {
    id: "evidence_capture",
    label: "evidence_capture",
    kind: "skill",
    blurb: "Every cited location must come from a file inspected this run.",
  },
  {
    id: "response_optimization",
    label: "response_optimization",
    kind: "skill",
    blurb:
      "≤3 hypotheses, strongest first; lower confidence for partial evidence.",
  },

  // System prompts shipped by the harness, named by their role/file in code.
  {
    id: "security-source-sink-v1",
    label: "security-source-sink-v1",
    kind: "prompt",
    blurb:
      "Default benchmark prompt pack. System + initial prompt with task, artifact, tool guide, skills, and output contract sections.",
  },
  {
    id: "buildCoordinatorSystemPrompt",
    label: "audit/coordinator",
    kind: "prompt",
    blurb:
      "Plan-shards-dispatch contract. Lists the 10 default shards and forbids writing findings directly.",
  },
  {
    id: "buildInvestigatorSystemPrompt",
    label: "audit/investigator",
    kind: "prompt",
    blurb:
      "Single-shard hunt. Submits structured findings via submit_audit_finding only.",
  },
  {
    id: "buildValidatorSystemPrompt",
    label: "audit/validator",
    kind: "prompt",
    blurb:
      "Re-derives evidence from a fresh state. Returns confirm or dismiss with a refined confidence band.",
  },
  {
    id: "buildReproDevinPrompt",
    label: "cve-followup/repro",
    kind: "prompt",
    blurb:
      "Devin contract for reproducing a finding against the upstream repo.",
  },
  {
    id: "buildFixDevinPrompt",
    label: "cve-followup/fix",
    kind: "prompt",
    blurb: "Devin contract for proposing a patch once repro succeeds.",
  },
];

// From packages/control-plane/src/audits/shards.ts.
export const AUDIT_SHARDS: { id: string; isDefault: boolean }[] = [
  { id: "auth", isDefault: true },
  { id: "parsing", isDefault: true },
  { id: "sql", isDefault: true },
  { id: "deserialization", isDefault: true },
  { id: "crypto", isDefault: true },
  { id: "exec", isDefault: true },
  { id: "network", isDefault: true },
  { id: "fs", isDefault: true },
  { id: "ssrf", isDefault: false },
  { id: "ipc", isDefault: false },
  { id: "frontend", isDefault: true },
  { id: "secrets", isDefault: true },
  { id: "concurrency", isDefault: false },
  { id: "memory", isDefault: false },
  { id: "other", isDefault: false },
];

export interface AgentRole {
  binding: string;
  emits: string[];
  id: "coordinator" | "investigator" | "validator";
  label: string;
  responsibility: string;
}

// Real flow from audits/coordinator-tools.ts + audits/prompts.ts.
export const ROLES: AgentRole[] = [
  {
    id: "coordinator",
    label: "AuditCoordinatorAgent",
    binding: "AUDIT_COORDINATOR",
    responsibility:
      "Orients on the repo, calls plan_shards, fans out investigators in parallel, then dispatches a validator per finding, then finalize_audit.",
    emits: [
      "plan_shards",
      "dispatch_investigator",
      "dispatch_validator",
      "finalize_audit",
    ],
  },
  {
    id: "investigator",
    label: "AuditInvestigatorAgent",
    binding: "AUDIT_INVESTIGATOR",
    responsibility:
      "One per planned shard. Locates modules in scope, traces source→sink within its attack surface, and submits each candidate as evidence-backed JSON.",
    emits: ["submit_audit_finding"],
  },
  {
    id: "validator",
    label: "AuditValidatorAgent",
    binding: "AUDIT_VALIDATOR",
    responsibility:
      "One per candidate. Reopens cited files, re-checks reachability and exploitability, and returns confirm or dismiss with a refined severity and confidence.",
    emits: ["submit_validation"],
  },
];

export interface RunMode {
  agents: string;
  budget: string;
  id: "benchmark" | "audit" | "cve_followup";
  label: string;
  orchestrator: string;
  scope: string;
  triggers: string[];
}

export const RUN_MODES: RunMode[] = [
  {
    id: "benchmark",
    label: "Benchmark mode",
    scope:
      "One ECVEBench task at a fixed L0–L3 difficulty, pinned to a vulnerable commit.",
    orchestrator: "BenchmarkRunOrchestrator",
    agents: "1 × SessionAgent (Cloudflare Think)",
    budget:
      "10 turns · 50 steps · 40 tool calls · 250k in / 50k out / 300k total tokens · 600s timeout",
    triggers: [
      "POST /benchmarks/runs from the dashboard",
      "Scheduled benchmark sweeps via cron",
      "CVE follow-up retrigger after a low-score run",
    ],
  },
  {
    id: "audit",
    label: "Audit mode",
    scope:
      "Whole repository at a chosen ref. Subagent fan-out across attack surfaces.",
    orchestrator: "AuditOrchestrator",
    agents:
      "1 × Coordinator + N × Investigator (1/shard, default 10) + 1 × Validator per candidate finding",
    budget:
      "Coordinator turn + grace 60s · investigator default 600s · validator default 300s · 7200s watchdog",
    triggers: [
      "POST /audits with repoUrl + ref",
      "minConfidence threshold gates which findings ship",
    ],
  },
  {
    id: "cve_followup",
    label: "CVE follow-up",
    scope:
      "Post-benchmark: take the agent's finding back to the upstream repo for repro and fix.",
    orchestrator: "CveFollowupOrchestrator",
    agents: "Devin sessions (repro stage → fix stage)",
    budget:
      "Per-stage wall clock · auto-fires only above CVE_FOLLOWUP_AUTOFIRE_MIN_CONFIDENCE",
    triggers: [
      "autoFollowup=true on a benchmark run",
      "Manual scheduleAfterBenchmarkCompletedIfEligible",
    ],
  },
];

// Models in rotation, from packages/shared/src/lib/models.ts (MODEL_PROVIDERS).
export const MODEL_PROVIDERS: { id: string; label: string; default: string }[] =
  [
    { id: "openai", label: "OpenAI", default: "gpt-5-codex" },
    { id: "anthropic", label: "Anthropic", default: "claude-sonnet-4-6" },
    { id: "gemini", label: "Gemini", default: "gemini-2.5-pro" },
    { id: "kimi", label: "Kimi", default: "kimi-k2.6" },
    { id: "glm", label: "GLM", default: "glm-4.6" },
  ];

export interface FlowStep {
  actor: "edge" | "do" | "modal";
  detail: string;
  id: string;
  label: string;
}

// Reflects BenchmarkRunOrchestrator.start() in benchmarks/orchestrator.ts.
export const BENCHMARK_FLOW: FlowStep[] = [
  {
    id: "ingress",
    actor: "edge",
    label: "Ingress",
    detail:
      "Worker handles POST /benchmarks/runs. Run row + events written to D1.",
  },
  {
    id: "provision",
    actor: "edge",
    label: "Provision artifact",
    detail:
      "createGitTreeStore.ensureStableTarget mirrors the target repo for the run.",
  },
  {
    id: "session",
    actor: "do",
    label: "SessionAgent.init",
    detail:
      "Worker materialises the SessionAgent DO with the rendered prompt pack.",
  },
  {
    id: "checkout",
    actor: "modal",
    label: "Modal /git/checkout",
    detail: "modal-shim clones the pinned commit into the per-run sandbox.",
  },
  {
    id: "turn",
    actor: "do",
    label: "agent.requestFollowUp",
    detail:
      "Single exploration turn under the configured budgets and tool tier.",
  },
  {
    id: "submit",
    actor: "do",
    label: "submit_benchmark_result",
    detail: "Schema-validated JSON exits via the dedicated submission tool.",
  },
  {
    id: "score",
    actor: "edge",
    label: "Score + persist",
    detail:
      "scoreBestCandidate runs, result written to D1, run marked completed.",
  },
];

export interface ToolkitStat {
  label: string;
  value: number;
}

export const TOOLKIT_STATS: ToolkitStat[] = [
  { label: "Tool capabilities", value: 11 },
  { label: "Benchmark skills", value: 7 },
  { label: "Audit shards", value: 15 },
  { label: "Sandbox profiles", value: 9 },
];
