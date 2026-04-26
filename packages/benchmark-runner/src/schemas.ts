import { ModelProviderSchema } from "@codebreaker/shared/schemas/primitives";
import { z } from "zod";

const GHSA_ID_PATTERN = /^GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}$/;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const DATASET_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const DEFAULT_BENCHMARK_MAX_INPUT_TOKENS = 300_000;
export const DEFAULT_BENCHMARK_MAX_STEPS = 50;
export const DEFAULT_BENCHMARK_MAX_TOOL_CALLS = 40;
export const DEFAULT_BENCHMARK_MAX_TOTAL_TOKENS = 500_000;
export const DEFAULT_BENCHMARK_MAX_TURNS = 10;
export const DEFAULT_BENCHMARK_TIMEOUT_SECONDS = 600;

export const GhsaIdSchema = z.string().regex(GHSA_ID_PATTERN);
export type GhsaId = z.infer<typeof GhsaIdSchema>;

export const CommitShaSchema = z.string().regex(COMMIT_SHA_PATTERN);
export type CommitSha = z.infer<typeof CommitShaSchema>;

export const DifficultySchema = z.enum(["L0", "L1", "L2", "L3"]);
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

export const LocalizationHintSchema = z
  .object({
    area: z.string(),
  })
  .strict();
export type LocalizationHint = z.infer<typeof LocalizationHintSchema>;

export const CveHintSchema = z
  .object({
    description: z.string(),
  })
  .strict();
export type CveHint = z.infer<typeof CveHintSchema>;

export const CombinedHintSchema = z
  .object({
    area: z.string(),
    description: z.string(),
  })
  .strict();
export type CombinedHint = z.infer<typeof CombinedHintSchema>;

export const HintSchema = z.union([
  LocalizationHintSchema,
  CveHintSchema,
  CombinedHintSchema,
]);
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
        L1: HintSchema.optional(),
        L2: CveHintSchema.optional(),
        L3: CombinedHintSchema.optional(),
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
  "result_parse_failed",
  "artifact_committed",
  "cleanup_completed",
  "finalize_started",
  "finalize_completed",
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
    autoFollowup: z.boolean().default(false),
    autoStart: z.boolean().default(true),
    cleanupPolicy: BenchmarkCleanupPolicySchema.default("retain"),
    difficulty: DifficultySchema,
    id: z.string().min(1).optional(),
    maxSteps: z.number().int().positive().default(DEFAULT_BENCHMARK_MAX_STEPS),
    maxTurns: z.number().int().positive().default(DEFAULT_BENCHMARK_MAX_TURNS),
    maxInputTokens: z
      .number()
      .int()
      .positive()
      .default(DEFAULT_BENCHMARK_MAX_INPUT_TOKENS),
    model: BenchmarkRunModelSchema,
    maxToolCalls: z
      .number()
      .int()
      .positive()
      .default(DEFAULT_BENCHMARK_MAX_TOOL_CALLS),
    maxTotalTokens: z
      .number()
      .int()
      .positive()
      .default(DEFAULT_BENCHMARK_MAX_TOTAL_TOKENS),
    taskId: z.string().min(1),
    timeoutSeconds: z
      .number()
      .int()
      .positive()
      .default(DEFAULT_BENCHMARK_TIMEOUT_SECONDS),
  })
  .strict();
export type CreateBenchmarkRunRequest = z.infer<
  typeof CreateBenchmarkRunRequestSchema
>;

export const BenchmarkRunScoreBreakdownSchema = z
  .object({
    correctLocations: z.number().int().nonnegative().nullable(),
    locationScore: z.number().min(0).max(1).nullable(),
    vulnClassMatched: z.boolean().nullable(),
    vulnerableMatched: z.boolean().nullable(),
  })
  .strict();
export type BenchmarkRunScoreBreakdown = z.infer<
  typeof BenchmarkRunScoreBreakdownSchema
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
    inputTokens: z.number().int().nonnegative().nullable(),
    modelId: z.string().min(1),
    modelProvider: ModelProviderSchema,
    outputTokens: z.number().int().nonnegative().nullable(),
    score: z.number().min(0).max(1).nullable(),
    scoreBreakdown: BenchmarkRunScoreBreakdownSchema.nullable().optional(),
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

export const ListBenchmarkRunsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(30),
  offset: z.coerce.number().int().nonnegative().default(0),
});
export type ListBenchmarkRunsQuery = z.infer<
  typeof ListBenchmarkRunsQuerySchema
>;

export const ListBenchmarkRunsResponseSchema = z
  .object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    runs: z.array(BenchmarkRunRowSchema),
    total: z.number().int().nonnegative(),
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

export const ReproManifestTierSchema = z.enum([
  "unit",
  "integration",
  "stack",
  "observational",
]);
export type ReproManifestTier = z.infer<typeof ReproManifestTierSchema>;

/**
 * Devin occasionally emits the legacy keys `exitCode`/`marker` instead of
 * `expectedExitCode`/`expectedMarker`. Accept both shapes and normalize at the
 * schema layer so the orchestrator never sees the legacy form.
 */
export const ReproManifestOutcomeSchema = z
  .object({
    exitCode: z.number().int().optional(),
    expectedExitCode: z.number().int().optional(),
    expectedMarker: z.string().min(1).optional(),
    marker: z.string().min(1).optional(),
  })
  .passthrough()
  .transform((value, ctx) => {
    const expectedExitCode = value.expectedExitCode ?? value.exitCode;
    const expectedMarker = value.expectedMarker ?? value.marker;
    if (expectedExitCode === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expectedExitCode (or legacy exitCode) is required",
      });
      return z.NEVER;
    }
    if (expectedMarker === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expectedMarker (or legacy marker) is required",
      });
      return z.NEVER;
    }
    return { expectedExitCode, expectedMarker };
  })
  .pipe(
    z
      .object({
        expectedExitCode: z.number().int(),
        expectedMarker: z.string().min(1),
      })
      .strict()
  );
export type ReproManifestOutcome = z.infer<typeof ReproManifestOutcomeSchema>;

export const ReproManifestObservationalSchema = z
  .object({
    filePatterns: z.array(z.string().min(1)).min(1),
    fingerprint: z.string().min(1),
  })
  .strict();
export type ReproManifestObservational = z.infer<
  typeof ReproManifestObservationalSchema
>;

export const ReproManifestSchema = z
  .object({
    command: z.string().min(1),
    fixed: ReproManifestOutcomeSchema,
    ghsaId: GhsaIdSchema,
    language: z.string().min(1),
    notes: z.string(),
    setup: z.array(z.string().min(1)).default([]),
    tier: ReproManifestTierSchema,
    timeoutSeconds: z.number().int().positive(),
    vulnerable: ReproManifestOutcomeSchema,
    vulnClass: VulnClassSchema,
    observational: ReproManifestObservationalSchema.optional(),
  })
  .strict();
export type ReproManifest = z.infer<typeof ReproManifestSchema>;

export const CveFollowupStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export type CveFollowupStatus = z.infer<typeof CveFollowupStatusSchema>;

export const CveFollowupStageKindSchema = z.enum([
  "repro",
  "fix",
  "review_repro",
  "review_fix",
]);
export type CveFollowupStageKind = z.infer<typeof CveFollowupStageKindSchema>;

export const CveFollowupStageStatusSchema = z.enum([
  "pending",
  "dispatched",
  "validating",
  "succeeded",
  "succeeded_weak",
  "failed",
  "skipped",
  "cancelled",
]);
export type CveFollowupStageStatus = z.infer<
  typeof CveFollowupStageStatusSchema
>;

export const CveFollowupEventKindSchema = z.enum([
  "artifact_from_task",
  "created",
  "repro_dispatched",
  "repro_validated",
  /** repro.json found on branch while Devin session status was still non-terminal */
  "repro_github_ready",
  "fix_dispatched",
  "fix_validated",
  "review_repro_dispatched",
  "review_fix_dispatched",
  "review_repro_done",
  "review_fix_done",
  "validation_started",
  "validation_finished",
  "stage_skipped",
  "failed",
  "cancelled",
  "triage",
  "deepwiki_prefetch",
  "stage_retry",
]);
export type CveFollowupEventKind = z.infer<typeof CveFollowupEventKindSchema>;

export const CveFollowupStageRowSchema = z
  .object({
    attempts: z.number().int().nonnegative(),
    branch: z.string().nullable(),
    createdAt: z.string().datetime(),
    devinSessionId: z.string().nullable(),
    devinUrl: z.string().nullable(),
    id: z.string().min(1),
    kind: CveFollowupStageKindSchema,
    lastError: z.string().nullable(),
    /**
     * Devin session status, fetched live from Devin's API at response time.
     * Null when the stage has no Devin session or when the live fetch failed
     * or was skipped (e.g. Devin not configured, or stage already terminal).
     */
    liveDevinStatus: z.string().nullable().optional(),
    modalSandbox: z
      .object({
        createdAt: z.number(),
        dashboardCommand: z.string().min(1),
        profile: z.string().min(1),
        sandboxId: z.string().min(1),
        sessionId: z.string().min(1),
        snapshotId: z.string().nullable(),
      })
      .strict()
      .nullable()
      .optional(),
    prUrl: z.string().nullable(),
    status: CveFollowupStageStatusSchema,
    updatedAt: z.string().datetime(),
    validationResultId: z.string().nullable(),
  })
  .strict();
export type CveFollowupStageRow = z.infer<typeof CveFollowupStageRowSchema>;

export const CveFollowupValidationRowSchema = z
  .object({
    createdAt: z.string().datetime(),
    exitCode: z.number().int().nullable(),
    id: z.string().min(1),
    manifestJson: z.string().nullable(),
    markerSeen: z.boolean().nullable(),
    observationalFingerprintMatched: z.boolean().nullable(),
    passed: z.boolean(),
    stageId: z.string().min(1),
    stderrExcerpt: z.string().nullable(),
    stdoutExcerpt: z.string().nullable(),
    tier: ReproManifestTierSchema.nullable(),
  })
  .strict();
export type CveFollowupValidationRow = z.infer<
  typeof CveFollowupValidationRowSchema
>;

export const CveFollowupEventRowSchema = z
  .object({
    createdAt: z.string().datetime(),
    details: z.unknown().nullable(),
    id: z.string().min(1),
    followupId: z.string().min(1),
    kind: CveFollowupEventKindSchema,
    message: z.string().min(1),
  })
  .strict();
export type CveFollowupEventRow = z.infer<typeof CveFollowupEventRowSchema>;

export const CveFollowupRowSchema = z
  .object({
    autoFired: z.boolean(),
    cancellationReason: z.string().nullable(),
    completedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    deepwikiContext: z.string().nullable(),
    ghsaId: GhsaIdSchema,
    id: z.string().min(1),
    repoName: z.string().nullable(),
    runId: z.string().min(1),
    status: CveFollowupStatusSchema,
    taskId: z.string().min(1),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type CveFollowupRow = z.infer<typeof CveFollowupRowSchema>;

export const CveFollowupSummarySchema = z
  .object({
    followup: CveFollowupRowSchema,
    stages: z.array(CveFollowupStageRowSchema),
  })
  .strict();
export type CveFollowupSummary = z.infer<typeof CveFollowupSummarySchema>;

export const CveFollowupDetailResponseSchema = z
  .object({
    events: z.array(CveFollowupEventRowSchema),
    followup: CveFollowupRowSchema,
    stages: z.array(CveFollowupStageRowSchema),
    validations: z.array(CveFollowupValidationRowSchema),
  })
  .strict();
export type CveFollowupDetailResponse = z.infer<
  typeof CveFollowupDetailResponseSchema
>;

export const ListCveFollowupsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).default(200),
  })
  .strict();
export type ListCveFollowupsQuery = z.infer<typeof ListCveFollowupsQuerySchema>;

export const ListCveFollowupsResponseSchema = z
  .object({
    followups: z.array(CveFollowupSummarySchema),
  })
  .strict();
export type ListCveFollowupsResponse = z.infer<
  typeof ListCveFollowupsResponseSchema
>;

export const CreateCveFollowupRequestSchema = z
  .object({
    force: z.boolean().default(false),
    stages: z.array(CveFollowupStageKindSchema).optional(),
  })
  .strict()
  .default({ force: false });
export type CreateCveFollowupRequest = z.infer<
  typeof CreateCveFollowupRequestSchema
>;

export const CveFollowupActionResponseSchema = z
  .object({
    followup: CveFollowupRowSchema,
  })
  .strict();
export type CveFollowupActionResponse = z.infer<
  typeof CveFollowupActionResponseSchema
>;

export const CveFollowupStageRetryParamsSchema = z.object({
  kind: CveFollowupStageKindSchema,
});
export type CveFollowupStageRetryParams = z.infer<
  typeof CveFollowupStageRetryParamsSchema
>;

export const parseReproManifest = (value: unknown): ReproManifest =>
  ReproManifestSchema.parse(value);

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
    hint: task.hints[difficulty] ?? null,
    task_id: task.task_id,
  });

export const summarizeTask = (task: TaskInstance): BenchmarkTaskSummary => {
  const difficulties = (["L0", "L1", "L2", "L3"] as const).filter(
    (d) => task.hints[d] !== undefined
  );

  return BenchmarkTaskSummarySchema.parse({
    difficulties,
    ghsaId: task.ghsa_id,
    language: task.codebase.language,
    repo: task.codebase.repo,
    taskId: task.task_id,
    vulnClass: task.ground_truth.vuln_class,
  });
};

export const scoreAgentOutput = (
  task: TaskInstance,
  output: AgentOutput
): BenchmarkRunScore => {
  const expectedLocations = new Set(
    task.ground_truth.locations.map((location) => location.file)
  );
  const matchedFiles = new Set(
    output.locations
      .filter((location) => expectedLocations.has(location.file))
      .map((location) => location.file)
  );
  const correctLocations = matchedFiles.size;
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

const MAX_CANDIDATES = 3;

/**
 * Score up to {@link MAX_CANDIDATES} agent outputs and return the
 * oracle-best (highest composite score) along with the winning output.
 *
 * If `candidates` is empty the function throws.
 */
export const scoreBestCandidate = (
  task: TaskInstance,
  candidates: AgentOutput[]
): { output: AgentOutput; score: BenchmarkRunScore } => {
  if (candidates.length === 0) {
    throw new Error("scoreBestCandidate requires at least one candidate");
  }

  const capped = candidates.slice(0, MAX_CANDIDATES);
  let bestOutput = capped[0] as AgentOutput;
  let bestScore = scoreAgentOutput(task, bestOutput);

  for (let i = 1; i < capped.length; i++) {
    const candidate = capped[i] as AgentOutput;
    const candidateScore = scoreAgentOutput(task, candidate);
    if (candidateScore.score > bestScore.score) {
      bestOutput = candidate;
      bestScore = candidateScore;
    }
  }

  return { output: bestOutput, score: bestScore };
};
