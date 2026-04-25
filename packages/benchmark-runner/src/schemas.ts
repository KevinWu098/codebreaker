import { ModelProviderSchema } from "@codebreaker/shared/schemas/primitives";
import { z } from "zod";

const GHSA_ID_PATTERN = /^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const DATASET_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const GhsaIdSchema = z.string().regex(GHSA_ID_PATTERN);
export type GhsaId = z.infer<typeof GhsaIdSchema>;

export const CommitShaSchema = z.string().regex(COMMIT_SHA_PATTERN);
export type CommitSha = z.infer<typeof CommitShaSchema>;

export const DifficultySchema = z.enum(["L0", "L1"]);
export type Difficulty = z.infer<typeof DifficultySchema>;

export const VulnClassSchema = z.enum([
  "command-injection",
  "sql-injection",
  "xss",
  "buffer-overflow",
  "use-after-free",
  "path-traversal",
  "auth-bypass",
  "xxe",
  "insecure-deserialization",
  "crypto-weakness",
  "race-condition",
  "integer-overflow",
  "null-deref",
]);
export type VulnClass = z.infer<typeof VulnClassSchema>;

export const CodebaseSchema = z
  .object({
    commit: CommitShaSchema,
    ecosystem: z.string(),
    language: z.string(),
    repo: z.string().url(),
  })
  .strict();
export type Codebase = z.infer<typeof CodebaseSchema>;

export const HintSchema = z
  .object({
    description: z.string(),
  })
  .strict();
export type Hint = z.infer<typeof HintSchema>;

export const FindingLocationSchema = z
  .object({
    file: z.string(),
    function: z.string().nullable(),
  })
  .strict();
export type FindingLocation = z.infer<typeof FindingLocationSchema>;

export const TaskInstanceSchema = z
  .object({
    codebase: CodebaseSchema,
    ghsa_id: GhsaIdSchema,
    ground_truth: z
      .object({
        cvss: z.number().min(0).max(10).nullable(),
        locations: z.array(FindingLocationSchema).min(1),
        reason: z.string(),
        vuln_class: VulnClassSchema,
        vulnerable: z.boolean(),
      })
      .strict(),
    hints: z
      .object({
        L0: z.null(),
        L1: HintSchema,
      })
      .strict(),
    task_id: z.string(),
  })
  .strict();
export type TaskInstance = z.infer<typeof TaskInstanceSchema>;

export const InternalMetadataSchema = z
  .object({
    curation_notes: z.string(),
    dataset_version: z.string().regex(DATASET_VERSION_PATTERN),
    ghsa_id: GhsaIdSchema,
    noisy_patch: z.boolean(),
    post_patch_commit: CommitShaSchema,
    snapshot_date: z.string().regex(DATE_PATTERN),
  })
  .strict();
export type InternalMetadata = z.infer<typeof InternalMetadataSchema>;

export const AgentInputSchema = z
  .object({
    codebase: CodebaseSchema,
    difficulty: DifficultySchema,
    hint: HintSchema.nullable(),
    task_id: z.string(),
  })
  .strict();
export type AgentInput = z.infer<typeof AgentInputSchema>;

export const AgentOutputSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    difficulty: DifficultySchema,
    locations: z.array(FindingLocationSchema),
    reason: z.string().nullable(),
    task_id: z.string(),
    vuln_class: VulnClassSchema.nullable(),
    vulnerable: z.boolean(),
  })
  .strict();
export type AgentOutput = z.infer<typeof AgentOutputSchema>;

export const BenchmarkRunStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "cleaning_up",
  "cleaned",
]);
export type BenchmarkRunStatus = z.infer<typeof BenchmarkRunStatusSchema>;

export const BenchmarkCleanupPolicySchema = z.enum([
  "retain",
  "terminate_sandbox",
  "archive_repo",
  "archive_repo_and_terminate",
]);
export type BenchmarkCleanupPolicy = z.infer<
  typeof BenchmarkCleanupPolicySchema
>;

export const BenchmarkRunEventKindSchema = z.enum([
  "created",
  "session_created",
  "checkout_started",
  "checkout_completed",
  "agent_started",
  "agent_completed",
  "result_parsed",
  "artifact_committed",
  "cleanup_completed",
  "failed",
  "cancelled",
]);
export type BenchmarkRunEventKind = z.infer<typeof BenchmarkRunEventKindSchema>;

export const BenchmarkRunModelSchema = z
  .object({
    id: z.string().min(1),
    provider: ModelProviderSchema,
    reasoningEffort: z.enum(["minimal", "low", "medium", "high"]).optional(),
  })
  .strict();
export type BenchmarkRunModel = z.infer<typeof BenchmarkRunModelSchema>;

export const CreateBenchmarkRunRequestSchema = z
  .object({
    autoStart: z.boolean().default(true),
    cleanupPolicy: BenchmarkCleanupPolicySchema.default("retain"),
    difficulty: DifficultySchema,
    id: z.string().min(1).optional(),
    maxTurns: z.number().int().positive().default(20),
    maxInputTokens: z.number().int().positive().optional(),
    model: BenchmarkRunModelSchema,
    maxToolCalls: z.number().int().positive().optional(),
    maxTotalTokens: z.number().int().positive().optional(),
    taskId: z.string().min(1),
    timeoutSeconds: z.number().int().positive().default(900),
  })
  .strict();
export type CreateBenchmarkRunRequest = z.infer<
  typeof CreateBenchmarkRunRequestSchema
>;

export const BenchmarkRunRowSchema = z
  .object({
    artifactCommitSha: z.string().nullable(),
    artifactPath: z.string().nullable(),
    cleanupCompletedAt: z.string().datetime().nullable(),
    cleanupPolicy: BenchmarkCleanupPolicySchema,
    completedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    difficulty: DifficultySchema,
    error: z.string().nullable(),
    id: z.string().min(1),
    modelId: z.string().min(1),
    modelProvider: ModelProviderSchema,
    score: z.number().min(0).max(1).nullable(),
    sessionId: z.string().nullable(),
    status: BenchmarkRunStatusSchema,
    taskId: z.string().min(1),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type BenchmarkRunRow = z.infer<typeof BenchmarkRunRowSchema>;

export const BenchmarkRunEventSchema = z
  .object({
    createdAt: z.string().datetime(),
    details: z.unknown().nullable(),
    id: z.string().min(1),
    kind: BenchmarkRunEventKindSchema,
    message: z.string().min(1),
    runId: z.string().min(1),
  })
  .strict();
export type BenchmarkRunEvent = z.infer<typeof BenchmarkRunEventSchema>;

export const BenchmarkRunScoreSchema = z
  .object({
    correctLocations: z.number().int().nonnegative(),
    expectedVulnerable: z.boolean(),
    locationScore: z.number().min(0).max(1),
    predictedVulnerable: z.boolean(),
    score: z.number().min(0).max(1),
    vulnClassMatched: z.boolean(),
    vulnerableMatched: z.boolean(),
  })
  .strict();
export type BenchmarkRunScore = z.infer<typeof BenchmarkRunScoreSchema>;

export const BenchmarkRunLocationSchema = z
  .object({
    createdAt: z.string().datetime(),
    file: z.string(),
    function: z.string().nullable(),
    id: z.string().min(1),
    matchedGroundTruth: z.boolean().nullable(),
    resultId: z.string().min(1),
    runId: z.string().min(1),
  })
  .strict();
export type BenchmarkRunLocation = z.infer<typeof BenchmarkRunLocationSchema>;

export const BenchmarkRunResultSchema = z
  .object({
    agentOutput: AgentOutputSchema.nullable(),
    artifactPath: z.string().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    correctLocations: z.number().int().nonnegative().nullable(),
    createdAt: z.string().datetime(),
    error: z.string().nullable(),
    expectedVulnClass: VulnClassSchema.nullable(),
    expectedVulnerable: z.boolean().nullable(),
    id: z.string().min(1),
    locationScore: z.number().min(0).max(1).nullable(),
    predictedVulnClass: VulnClassSchema.nullable(),
    predictedVulnerable: z.boolean().nullable(),
    rawOutput: z.string().nullable(),
    runId: z.string().min(1),
    score: BenchmarkRunScoreSchema.nullable(),
    vulnClassMatched: z.boolean().nullable(),
    vulnerableMatched: z.boolean().nullable(),
  })
  .strict();
export type BenchmarkRunResult = z.infer<typeof BenchmarkRunResultSchema>;

export const BenchmarkTaskSummarySchema = z
  .object({
    difficulties: z.array(DifficultySchema),
    ghsaId: GhsaIdSchema,
    language: z.string(),
    repo: z.string().url(),
    taskId: z.string().min(1),
    vulnClass: VulnClassSchema,
  })
  .strict();
export type BenchmarkTaskSummary = z.infer<typeof BenchmarkTaskSummarySchema>;

export const ListBenchmarkTasksResponseSchema = z
  .object({
    tasks: z.array(BenchmarkTaskSummarySchema),
  })
  .strict();
export type ListBenchmarkTasksResponse = z.infer<
  typeof ListBenchmarkTasksResponseSchema
>;

export const ListBenchmarkRunsResponseSchema = z
  .object({
    runs: z.array(BenchmarkRunRowSchema),
  })
  .strict();
export type ListBenchmarkRunsResponse = z.infer<
  typeof ListBenchmarkRunsResponseSchema
>;

export const BenchmarkRunDetailResponseSchema = z
  .object({
    events: z.array(BenchmarkRunEventSchema),
    locations: z.array(BenchmarkRunLocationSchema),
    result: BenchmarkRunResultSchema.nullable(),
    run: BenchmarkRunRowSchema,
    task: TaskInstanceSchema.nullable(),
  })
  .strict();
export type BenchmarkRunDetailResponse = z.infer<
  typeof BenchmarkRunDetailResponseSchema
>;

export const CreateBenchmarkRunResponseSchema = z
  .object({
    run: BenchmarkRunRowSchema,
  })
  .strict();
export type CreateBenchmarkRunResponse = z.infer<
  typeof CreateBenchmarkRunResponseSchema
>;

export const BenchmarkRunActionResponseSchema = z
  .object({
    run: BenchmarkRunRowSchema,
  })
  .strict();
export type BenchmarkRunActionResponse = z.infer<
  typeof BenchmarkRunActionResponseSchema
>;

export const parseTaskInstance = (value: unknown): TaskInstance =>
  TaskInstanceSchema.parse(value);

export const parseInternalMetadata = (value: unknown): InternalMetadata =>
  InternalMetadataSchema.parse(value);

export const parseAgentInput = (value: unknown): AgentInput =>
  AgentInputSchema.parse(value);

export const parseAgentOutput = (value: unknown): AgentOutput =>
  AgentOutputSchema.parse(value);

export const renderAgentInput = (
  task: TaskInstance,
  difficulty: Difficulty
): AgentInput =>
  AgentInputSchema.parse({
    codebase: task.codebase,
    difficulty,
    hint: task.hints[difficulty],
    task_id: task.task_id,
  });

export const summarizeTask = (task: TaskInstance): BenchmarkTaskSummary =>
  BenchmarkTaskSummarySchema.parse({
    difficulties: ["L0", "L1"],
    ghsaId: task.ghsa_id,
    language: task.codebase.language,
    repo: task.codebase.repo,
    taskId: task.task_id,
    vulnClass: task.ground_truth.vuln_class,
  });

export const scoreAgentOutput = (
  task: TaskInstance,
  output: AgentOutput
): BenchmarkRunScore => {
  const expectedLocations = new Set(
    task.ground_truth.locations.map((location) => location.file)
  );
  const correctLocations = output.locations.filter((location) =>
    expectedLocations.has(location.file)
  ).length;
  const vulnerableMatched = output.vulnerable === task.ground_truth.vulnerable;
  const vulnClassMatched = output.vuln_class === task.ground_truth.vuln_class;
  const locationScore =
    expectedLocations.size === 0
      ? 0
      : correctLocations / expectedLocations.size;
  const score =
    Number(vulnerableMatched) * 0.5 +
    Number(vulnClassMatched) * 0.25 +
    locationScore * 0.25;

  return BenchmarkRunScoreSchema.parse({
    correctLocations,
    expectedVulnerable: task.ground_truth.vulnerable,
    locationScore,
    predictedVulnerable: output.vulnerable,
    score,
    vulnClassMatched,
    vulnerableMatched,
  });
};
