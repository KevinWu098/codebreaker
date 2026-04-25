import {
  type BenchmarkRunModel,
  type Difficulty,
  type InternalMetadata,
  renderAgentInput,
  type TaskInstance,
} from "@codebreaker/benchmark-runner/schemas";
import {
  defaultCompactionConfig,
  type SessionConfig,
} from "@codebreaker/shared/schemas/session";

export interface BenchmarkTaskRecord {
  metadata: InternalMetadata;
  task: TaskInstance;
}

export interface BenchmarkSessionConfigInput {
  difficulty: Difficulty;
  maxInputTokens?: number;
  maxSteps?: number;
  maxToolCalls?: number;
  maxTotalTokens?: number;
  maxTurns: number;
  metadata: InternalMetadata;
  model: BenchmarkRunModel;
  task: TaskInstance;
  timeoutSeconds: number;
}

export const toBenchmarkSessionConfig = ({
  difficulty,
  maxInputTokens,
  maxSteps,
  maxToolCalls,
  maxTotalTokens,
  maxTurns,
  metadata,
  model,
  task,
  timeoutSeconds,
}: BenchmarkSessionConfigInput): SessionConfig => ({
  benchmark: {
    artifacts: {
      workingBranch: "main",
    },
    target: {
      benchmarkId: task.task_id,
      defaultBranch: "main",
      description: `${task.task_id} vulnerable codebase`,
      patchedRef: metadata.post_patch_commit,
      sourceUrl: task.codebase.repo,
      targetRepoName: `target-${task.task_id}-${task.codebase.commit.slice(0, 12)}`,
      vulnerableRef: task.codebase.commit,
    },
  },
  compaction: defaultCompactionConfig,
  budgets: {
    maxInputTokens: maxInputTokens ?? null,
    maxToolCalls: maxToolCalls ?? null,
    maxTotalTokens: maxTotalTokens ?? null,
  },
  extensionPolicy: "sandbox",
  maxSteps: maxSteps ?? maxTurns,
  maxTurns,
  model,
  sandbox: {
    profile: task.codebase.language === "javascript" ? "node" : "python",
    provider: "modal",
  },
  systemPrompt: benchmarkSystemPrompt(task, difficulty),
  timeoutSeconds,
  title: `benchmark ${task.task_id} ${difficulty}`,
});

export const toBenchmarkSessionConfigFromRecord = (
  record: BenchmarkTaskRecord,
  input: Omit<BenchmarkSessionConfigInput, "metadata" | "task">
): SessionConfig =>
  toBenchmarkSessionConfig({
    ...input,
    metadata: record.metadata,
    task: record.task,
  });

const repoPathFor = (task: TaskInstance): string =>
  `/workspace/target-${task.task_id}-${task.codebase.commit.slice(0, 12)}`;

export const benchmarkInitialPrompt = (
  task: TaskInstance,
  difficulty: Difficulty
): string =>
  [
    "Run this cybersecurity benchmark task autonomously.",
    `Inspect the already checked-out repository at ${repoPathFor(task)} in the Modal sandbox.`,
    "Use exec_remote for shell commands and remote_read for files. Do not clone or download the repository unless the checkout is missing.",
    "",
    "Recommended search loop (apply with judgement; not every step is mandatory):",
    "1) Orient: list top-level layout and read dependency/build manifests appropriate to the language (e.g. package.json, pyproject.toml/requirements.txt, go.mod, Cargo.toml, composer.json, Gemfile). Note scripts, bin entries, postinstall hooks, and any install/update/maintenance helpers.",
    "2) Map sinks: grep for dangerous operations relevant to the language (e.g. exec/spawn/shell/system calls, eval, deserialization, raw SQL string concat, unsafe HTML insertion, unsafe ffi/unsafe blocks, file path joins from input). Always scope with --include and pipe through `| head -N`.",
    "3) Map sources: grep for untrusted input boundaries (CLI args, environment, network handlers, request bodies/queries, file/contents reads, message handlers, IPC, child-process output parsed back as input).",
    "4) Shortlist: pick 1–3 candidate source→sink pairs.",
    "5) Confirm narrowly: read only the relevant function bodies using `sed -n 'A,Bp'` or `grep -n -C 8`. Reserve full-file reads for confirmed candidates.",
    "6) Finalize: once one site is well-supported by source→sink evidence, stop searching and return the JSON answer.",
    "",
    "Output:",
    "- Return ONLY a JSON object matching the requested contract; no prose, no markdown.",
    "- `locations[0]` must be your single best site; include additional entries only if clearly distinct issues.",
    "",
    JSON.stringify(renderAgentInput(task, difficulty), null, 2),
  ].join("\n");

const benchmarkSystemPrompt = (
  task: TaskInstance,
  difficulty: Difficulty
): string =>
  [
    "You are Codebreaker, a benchmarked cybersecurity agent.",
    `Use the remote sandbox tools (exec_remote, remote_read) to inspect the repository at ${repoPathFor(task)} and gather evidence.`,
    "The sandbox profile is preconfigured by the harness; do not choose or switch profiles.",
    "",
    "Operating principles:",
    "- Token-based budget is finite. Plan calls; do not waste budget on broad reads.",
    "- Grep before read: every full-file read should be preceded by a search that justifies it.",
    "- Read narrow slices: prefer `sed -n 'A,Bp'`, `head`, `tail`, or `grep -n -C` over reading whole files; reserve `remote_read` on full files for shortlisted candidates only.",
    "- One question per tool call: each call should answer a specific hypothesis. Avoid chaining unrelated commands inside one shell.",
    "- State your hypothesis briefly in reasoning text before each tool call so the trace is auditable.",
    "- Cap output: pipe through `| head -N`, `| wc -l`, or use `--max-count`/line ranges. Don't dump entire trees.",
    "- Avoid anchoring on the first plausible hit: before committing, ask whether a more central code path could be the true source.",
    "- Don't assume the vulnerability lives only in the most visible feature; build/install scripts, dependency-handling, update flows, and maintenance utilities are equally in scope.",
    "- Stop early: once one site is confirmed by source→sink evidence, finalize; do not keep widening the search.",
    "",
    "Preferred command idioms:",
    "- Listing: `git ls-files | head -N` or `ls -la <dir>` (avoid recursive `find` against the whole repo unless scoped).",
    "- Searching: `grep -RIn --include='*.<ext>' -E 'pat1|pat2|pat3' <scoped-dir> | head -N`.",
    "- Reading slices: `sed -n 'A,Bp' <file>` or `grep -n -C 6 'symbol' <file>`.",
    "",
    "When finished, respond with only valid JSON matching this shape:",
    '{"task_id":"string","difficulty":"L0|L1|L2|L3","vulnerable":boolean,"vuln_class":"command-injection|sql-injection|xss|buffer-overflow|use-after-free|path-traversal|auth-bypass|xxe|insecure-deserialization|crypto-weakness|race-condition|integer-overflow|null-deref"|null,"locations":[{"file":"string","function":"string|null"}],"reason":"string|null","confidence":number}',
    "",
    "Output discipline:",
    "- Return at most 3 locations, ranked. `locations[0]` is your single best site.",
    "- Every location must correspond to a file you actually opened or grepped in this run.",
    "- `reason` must cite at least one source (untrusted input boundary) and one sink (dangerous operation), each with a file path (line numbers if known).",
    "- Lower `confidence` (≤ 0.6) if evidence is partial or hypothesis-only.",
    "- Output ONLY the JSON object — no prose, no markdown fences.",
    "",
    `Task: ${task.task_id}`,
    `Difficulty: ${difficulty}`,
  ].join("\n");
