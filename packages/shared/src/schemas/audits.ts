import { ModelProviderSchema } from "@codebreaker/shared/schemas/primitives";
import { SandboxProfileNameSchema } from "@codebreaker/shared/schemas/sandbox";
import { z } from "zod";

export const AUDIT_VULN_CLASSES = [
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
  "ssrf",
  "csrf",
  "open-redirect",
  "prototype-pollution",
  "regex-dos",
  "log-injection",
  "secret-exposure",
  "other",
] as const;

export const AuditVulnClassSchema = z.enum(AUDIT_VULN_CLASSES);
export type AuditVulnClass = z.infer<typeof AuditVulnClassSchema>;

export const AUDIT_SHARD_KINDS = [
  "auth",
  "parsing",
  "sql",
  "deserialization",
  "crypto",
  "exec",
  "network",
  "fs",
  "ssrf",
  "ipc",
  "frontend",
  "secrets",
  "concurrency",
  "memory",
  "other",
] as const;

export const ShardKindSchema = z.enum(AUDIT_SHARD_KINDS);
export type ShardKind = z.infer<typeof ShardKindSchema>;

export const AuditSeveritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);
export type AuditSeverity = z.infer<typeof AuditSeveritySchema>;

export const AuditFindingLocationSchema = z
  .object({
    file: z.string().min(1),
    function: z.string().min(1).nullable().optional(),
    lineEnd: z.number().int().positive().nullable().optional(),
    lineStart: z.number().int().positive().nullable().optional(),
  })
  .strict();
export type AuditFindingLocation = z.infer<typeof AuditFindingLocationSchema>;

export const AuditFindingStatusSchema = z.enum([
  "candidate",
  "validated",
  "dismissed",
]);
export type AuditFindingStatus = z.infer<typeof AuditFindingStatusSchema>;

export const AuditFindingSubmissionSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    cwe: z.string().min(1).optional(),
    description: z.string().min(1).max(8000),
    evidence: z.string().min(1).max(8000),
    locations: z.array(AuditFindingLocationSchema).min(1).max(5),
    pocSketch: z.string().min(1).max(4000).optional(),
    references: z.array(z.string().url()).max(10).optional(),
    severity: AuditSeveritySchema,
    title: z.string().min(1).max(200),
    vulnClass: AuditVulnClassSchema,
  })
  .strict();
export type AuditFindingSubmission = z.infer<
  typeof AuditFindingSubmissionSchema
>;

export const AuditValidationVerdictSchema = z.enum(["confirm", "dismiss"]);
export type AuditValidationVerdict = z.infer<
  typeof AuditValidationVerdictSchema
>;

export const AuditValidationSubmissionSchema = z
  .object({
    confidence: z.number().min(0).max(1),
    notes: z.string().min(1).max(8000),
    refinedLocations: z.array(AuditFindingLocationSchema).max(5).optional(),
    refinedSeverity: AuditSeveritySchema.optional(),
    verdict: AuditValidationVerdictSchema,
  })
  .strict();
export type AuditValidationSubmission = z.infer<
  typeof AuditValidationSubmissionSchema
>;

export const AuditModelSchema = z
  .object({
    id: z.string().min(1),
    provider: ModelProviderSchema,
    reasoningEffort: z.enum(["minimal", "low", "medium", "high"]).optional(),
  })
  .strict();
export type AuditModel = z.infer<typeof AuditModelSchema>;

export const AuditBudgetsSchema = z
  .object({
    maxInputTokens: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
    maxToolCalls: z.number().int().positive().optional(),
    maxTotalTokens: z.number().int().positive().optional(),
  })
  .strict();
export type AuditBudgets = z.infer<typeof AuditBudgetsSchema>;

// Per-shard budget overrides. Only investigator subagents are spawned per shard,
// so these caps only affect investigators. Coordinator + validators always use
// the top-level `budgets` (or defaults).
export const ShardBudgetsSchema = z.partialRecord(
  ShardKindSchema,
  AuditBudgetsSchema
);
export type ShardBudgets = z.infer<typeof ShardBudgetsSchema>;

export const CreateAuditRequestSchema = z
  .object({
    autoStart: z.boolean().default(true),
    /**
     * Default per-DO budget for investigator and validator subagents. The
     * coordinator's own budget is governed by `coordinatorBudgets` instead so
     * the orchestrator can be capped tightly without starving its workers.
     */
    budgets: AuditBudgetsSchema.optional(),
    /**
     * Coordinator-specific cap. Defaulted to a smaller value than
     * `budgets` because the coordinator's job is to plan + delegate, not to
     * read code. `dispatch_investigator`, `dispatch_validator`, and
     * `finalize_audit` are submission tools that bypass this cap so the
     * coordinator's last action can always be to initiate the remaining
     * subagents and finalize, even after exhausting its budget.
     */
    coordinatorBudgets: AuditBudgetsSchema.optional(),
    investigatorTimeoutSeconds: z
      .number()
      .int()
      .positive()
      .max(1800)
      .default(600),
    maxConcurrentInvestigators: z.number().int().min(1).max(8).default(4),
    minConfidence: z.number().min(0).max(1).default(0.7),
    model: AuditModelSchema,
    ref: z.string().min(1).max(200).optional(),
    repoUrl: z.string().url(),
    sandboxProfile: SandboxProfileNameSchema.default("recon"),
    shardBudgets: ShardBudgetsSchema.optional(),
    shards: z.array(ShardKindSchema).optional(),
    timeoutSeconds: z.number().int().positive().max(7200).default(2400),
    title: z.string().min(1).max(200).optional(),
    /**
     * Coordinator-only: budget to apply once the coordinator begins the
     * validation phase. Coordinator usage counters are reset to zero on the
     * first `dispatch_validator` call so investigation tokens never bleed
     * into validation. If unset, defaults to `coordinatorBudgets` (or the
     * coordinator's resolved budget at start of the run).
     */
    validationBudgets: AuditBudgetsSchema.optional(),
    validatorTimeoutSeconds: z.number().int().positive().max(900).default(300),
  })
  .strict();
export type CreateAuditRequest = z.infer<typeof CreateAuditRequestSchema>;

export const AuditStatusSchema = z.enum([
  "pending",
  "provisioning",
  "running",
  "completed",
  "failed",
  "cancelled",
  "cleaning_up",
  "cleaned",
]);
export type AuditStatus = z.infer<typeof AuditStatusSchema>;

export const AuditShardStatusSchema = z.enum([
  "planned",
  "investigating",
  "validating",
  "completed",
  "failed",
  "skipped",
]);
export type AuditShardStatus = z.infer<typeof AuditShardStatusSchema>;

export const AuditRowSchema = z
  .object({
    cleanupCompletedAt: z.string().datetime().nullable(),
    completedAt: z.string().datetime().nullable(),
    coordinatorSessionId: z.string().nullable(),
    createdAt: z.string().datetime(),
    error: z.string().nullable(),
    highConfidenceCount: z.number().int().nonnegative(),
    id: z.string().min(1),
    inputTokens: z.number().int().nonnegative().nullable(),
    minConfidence: z.number().min(0).max(1),
    mirrorRepoFullName: z.string().nullable(),
    modelId: z.string().min(1),
    modelProvider: ModelProviderSchema,
    outputTokens: z.number().int().nonnegative().nullable(),
    ref: z.string().nullable(),
    repoUrl: z.string().url(),
    sandboxProfile: SandboxProfileNameSchema.nullable(),
    startedAt: z.string().datetime().nullable(),
    status: AuditStatusSchema,
    title: z.string().nullable(),
    totalCandidates: z.number().int().nonnegative(),
    updatedAt: z.string().datetime(),
    validatedCount: z.number().int().nonnegative(),
  })
  .strict();
export type AuditRow = z.infer<typeof AuditRowSchema>;

export const AuditShardRowSchema = z
  .object({
    auditId: z.string().min(1),
    completedAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    error: z.string().nullable(),
    id: z.string().min(1),
    investigatorSessionId: z.string().nullable(),
    kind: ShardKindSchema,
    startedAt: z.string().datetime().nullable(),
    status: AuditShardStatusSchema,
    summary: z.string().nullable(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type AuditShardRow = z.infer<typeof AuditShardRowSchema>;

export const AuditFindingRowSchema = z
  .object({
    auditId: z.string().min(1),
    confidence: z.number().min(0).max(1),
    createdAt: z.string().datetime(),
    cwe: z.string().nullable(),
    description: z.string(),
    evidence: z.string(),
    id: z.string().min(1),
    locations: z.array(AuditFindingLocationSchema),
    pocSketch: z.string().nullable(),
    references: z.array(z.string().url()),
    severity: AuditSeveritySchema,
    shardId: z.string().nullable(),
    shardKind: ShardKindSchema.nullable(),
    status: AuditFindingStatusSchema,
    title: z.string(),
    updatedAt: z.string().datetime(),
    validationNotes: z.string().nullable(),
    validatorSessionId: z.string().nullable(),
    vulnClass: AuditVulnClassSchema,
  })
  .strict();
export type AuditFindingRow = z.infer<typeof AuditFindingRowSchema>;

export const AuditEventKindSchema = z.enum([
  "created",
  "provisioning_started",
  "provisioning_completed",
  "checkout_started",
  "checkout_completed",
  "coordinator_started",
  "coordinator_completed",
  "shard_planned",
  "shard_started",
  "shard_completed",
  "shard_failed",
  "candidate_recorded",
  "validator_started",
  "validator_completed",
  "validator_failed",
  "finding_validated",
  "finding_dismissed",
  "completed",
  "failed",
  "cancelled",
  "cleanup_completed",
]);
export type AuditEventKind = z.infer<typeof AuditEventKindSchema>;

export const AuditEventSchema = z
  .object({
    auditId: z.string().min(1),
    createdAt: z.string().datetime(),
    details: z.unknown().nullable(),
    id: z.string().min(1),
    kind: AuditEventKindSchema,
    message: z.string().min(1),
  })
  .strict();
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const AuditConfigSchema = z
  .object({
    auditId: z.string().min(1),
    maxConcurrentInvestigators: z.number().int().min(1).max(8).default(4),
    minConfidence: z.number().min(0).max(1).default(0.7),
    mirrorRepo: z
      .object({
        cloneUrl: z.string().url(),
        defaultBranch: z.string().min(1),
        fullName: z.string().min(1),
        name: z.string().min(1),
      })
      .strict()
      .optional(),
    repoUrl: z.string().url(),
    role: z.enum(["coordinator", "investigator", "validator"]),
    /**
     * Modal sandbox id that holds the shared git checkout. Investigators and
     * validators use a different Durable Object name than the coordinator, but
     * `exec_remote` / sandbox APIs must use this id so all roles share one disk.
     */
    sandboxSessionId: z.string().min(1).optional(),
    workspacePath: z.string().min(1),
    findingId: z.string().min(1).optional(),
    ref: z.string().min(1).optional(),
    /**
     * Per-shard token budget overrides set on the COORDINATOR's audit config.
     * Investigator children inherit a single resolved `budgets` field via
     * `buildChildSessionConfig`, so this map never appears on an investigator
     * or validator's own audit config.
     */
    shardBudgets: ShardBudgetsSchema.optional(),
    /**
     * Default budget that the coordinator hands to investigator/validator
     * subagents. Set on the COORDINATOR's audit config so the coordinator's
     * own `SessionConfig.budgets` (its tight cap) does not cascade to the
     * children. Per-shard `shardBudgets` overrides win for investigators.
     * Children's audit configs do not carry this field.
     */
    investigatorBudgets: AuditBudgetsSchema.optional(),
    shardKind: ShardKindSchema.optional(),
    shardId: z.string().min(1).optional(),
    /**
     * Coordinator-only: budget that takes effect after the first
     * `dispatch_validator` call. Only set on the coordinator's audit config.
     */
    validationBudgets: AuditBudgetsSchema.optional(),
  })
  .strict();
export type AuditConfig = z.infer<typeof AuditConfigSchema>;

export const ListAuditsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(30),
  offset: z.coerce.number().int().nonnegative().default(0),
  status: AuditStatusSchema.optional(),
});
export type ListAuditsQuery = z.infer<typeof ListAuditsQuerySchema>;

export const ListAuditsResponseSchema = z
  .object({
    audits: z.array(AuditRowSchema),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })
  .strict();
export type ListAuditsResponse = z.infer<typeof ListAuditsResponseSchema>;

export const AuditDetailResponseSchema = z
  .object({
    audit: AuditRowSchema,
    events: z.array(AuditEventSchema),
    findings: z.array(AuditFindingRowSchema),
    shards: z.array(AuditShardRowSchema),
  })
  .strict();
export type AuditDetailResponse = z.infer<typeof AuditDetailResponseSchema>;

export const ListFindingsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(100),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  offset: z.coerce.number().int().nonnegative().default(0),
  shard: ShardKindSchema.optional(),
  status: AuditFindingStatusSchema.optional(),
  vulnClass: AuditVulnClassSchema.optional(),
});
export type ListFindingsQuery = z.infer<typeof ListFindingsQuerySchema>;

export const ListFindingsResponseSchema = z
  .object({
    findings: z.array(AuditFindingRowSchema),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })
  .strict();
export type ListFindingsResponse = z.infer<typeof ListFindingsResponseSchema>;

export const AuditActionResponseSchema = z
  .object({
    audit: AuditRowSchema,
  })
  .strict();
export type AuditActionResponse = z.infer<typeof AuditActionResponseSchema>;

export const FindingActionResponseSchema = z
  .object({
    finding: AuditFindingRowSchema,
  })
  .strict();
export type FindingActionResponse = z.infer<typeof FindingActionResponseSchema>;
