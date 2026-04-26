import {
  buildBenchmarkAgentPrompt,
  targetMirrorRepoName,
} from "@codebreaker/benchmark-runner/agent-core/prompts";
import type {
  BenchmarkRunModel,
  Difficulty,
  InternalMetadata,
  TaskInstance,
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
  artifactOwner?: string;
  difficulty: Difficulty;
  maxInputTokens?: number;
  maxOutputTokens?: number;
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
  artifactOwner,
  difficulty,
  maxInputTokens,
  maxOutputTokens,
  maxSteps,
  maxToolCalls,
  maxTotalTokens,
  maxTurns,
  metadata,
  model,
  task,
  timeoutSeconds,
}: BenchmarkSessionConfigInput): SessionConfig => {
  const effectiveMaxTurns = Math.max(2, maxTurns);

  return {
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
        targetRepoName: targetMirrorRepoName(task),
        vulnerableRef: task.codebase.commit,
      },
    },
    compaction: defaultCompactionConfig,
    budgets: {
      maxInputTokens: maxInputTokens ?? null,
      maxOutputTokens: maxOutputTokens ?? null,
      maxToolCalls: maxToolCalls ?? null,
      maxTotalTokens: maxTotalTokens ?? null,
    },
    extensionPolicy: "sandbox",
    maxSteps: maxSteps ?? effectiveMaxTurns,
    maxTurns: effectiveMaxTurns,
    model,
    sandbox: {
      profile: task.codebase.language === "javascript" ? "node" : "python",
      provider: "modal",
    },
    systemPrompt: benchmarkSystemPrompt(task, difficulty, artifactOwner),
    timeoutSeconds,
    title: `benchmark ${task.task_id} ${difficulty}`,
  };
};

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
  difficulty: Difficulty,
  artifactOwner?: string
): string =>
  buildBenchmarkAgentPrompt({
    ...(artifactOwner ? { artifactOwner } : {}),
    difficulty,
    environment: "think",
    task,
    toolMode: "sandbox",
  }).initialPrompt;

const benchmarkSystemPrompt = (
  task: TaskInstance,
  difficulty: Difficulty,
  artifactOwner: string | undefined
): string =>
  buildBenchmarkAgentPrompt({
    ...(artifactOwner ? { artifactOwner } : {}),
    difficulty,
    environment: "think",
    task,
    toolMode: "sandbox",
  }).systemPrompt;
