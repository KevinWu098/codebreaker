import {
  type BenchmarkRunModel,
  type Difficulty,
  type InternalMetadata,
  renderAgentInput,
  type TaskInstance,
} from "@codebreaker/benchmark-runner/schemas";
import {
  defaultCompactionConfig,
  defaultSessionRuntimeConfig,
  type SessionConfig,
} from "@codebreaker/shared/schemas/session";

export interface BenchmarkTaskRecord {
  metadata: InternalMetadata;
  task: TaskInstance;
}

export interface BenchmarkSessionConfigInput {
  difficulty: Difficulty;
  maxInputTokens?: number;
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
  maxSteps: defaultSessionRuntimeConfig.maxSteps,
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

export const benchmarkInitialPrompt = (
  task: TaskInstance,
  difficulty: Difficulty
): string =>
  [
    "Run this cybersecurity benchmark task autonomously.",
    "Inspect the checked-out repository in the Modal sandbox.",
    "Return only a JSON object matching the requested output contract.",
    "",
    JSON.stringify(renderAgentInput(task, difficulty), null, 2),
  ].join("\n");

const benchmarkSystemPrompt = (
  task: TaskInstance,
  difficulty: Difficulty
): string =>
  [
    "You are Codebreaker, a benchmarked cybersecurity agent.",
    "Use the remote sandbox tools to inspect the repository and gather evidence.",
    "When finished, respond with only valid JSON matching this shape:",
    '{"task_id":"string","difficulty":"L0|L1","vulnerable":boolean,"vuln_class":"command-injection|sql-injection|xss|buffer-overflow|use-after-free|path-traversal|auth-bypass|xxe|insecure-deserialization|crypto-weakness|race-condition|integer-overflow|null-deref"|null,"locations":[{"file":"string","function":"string|null"}],"reason":"string|null","confidence":number}',
    `Task: ${task.task_id}`,
    `Difficulty: ${difficulty}`,
  ].join("\n");
