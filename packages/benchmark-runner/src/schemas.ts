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
