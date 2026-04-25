import { BenchmarkConfigSchema } from "@codebreaker/shared/schemas/artifacts";
import {
  ExtensionPolicySchema,
  ModelProviderSchema,
  ReasoningEffortSchema,
  ScmProviderSchema,
} from "@codebreaker/shared/schemas/primitives";
import {
  SandboxProfileNameSchema,
  SandboxProviderSchema,
} from "@codebreaker/shared/schemas/sandbox";
import { z } from "zod";

export const RepoConfigSchema = z.object({
  defaultBranch: z.string().min(1).optional(),
  name: z.string().min(1),
  owner: z.string().min(1).optional(),
  provider: ScmProviderSchema,
  ref: z.string().min(1).optional(),
  url: z.string().url().optional(),
});
export type RepoConfig = z.infer<typeof RepoConfigSchema>;

export const CompactionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxContextTokens: z.number().int().positive().default(250_000),
  preserveRecentMessages: z.number().int().nonnegative().default(12),
  summarizeAtTokens: z.number().int().positive().default(225_000),
});
export type CompactionConfig = z.infer<typeof CompactionConfigSchema>;

export const defaultCompactionConfig = {
  enabled: true,
  maxContextTokens: 250_000,
  preserveRecentMessages: 12,
  summarizeAtTokens: 225_000,
} as const satisfies CompactionConfig;

export const defaultSessionRuntimeConfig = {
  maxInputTokens: null,
  maxSteps: 50,
  maxToolCalls: null,
  maxTotalTokens: null,
  maxTurns: 200,
  timeoutSeconds: 3600,
} as const;

export const ModelConfigSchema = z.object({
  id: z.string().min(1),
  provider: ModelProviderSchema,
  reasoningEffort: ReasoningEffortSchema.optional(),
});
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

export const SessionSandboxConfigSchema = z.object({
  profile: SandboxProfileNameSchema,
  provider: SandboxProviderSchema.default("modal"),
});
export type SessionSandboxConfig = z.infer<typeof SessionSandboxConfigSchema>;

export const RunBudgetConfigSchema = z.object({
  maxInputTokens: z.number().int().positive().nullable().default(null),
  maxToolCalls: z.number().int().positive().nullable().default(null),
  maxTotalTokens: z.number().int().positive().nullable().default(null),
});
export type RunBudgetConfig = z.infer<typeof RunBudgetConfigSchema>;

export const SessionConfigSchema = z.object({
  benchmark: BenchmarkConfigSchema.optional(),
  compaction: CompactionConfigSchema.default(defaultCompactionConfig),
  extensionPolicy: ExtensionPolicySchema.default("readonly"),
  budgets: RunBudgetConfigSchema.default({
    maxInputTokens: defaultSessionRuntimeConfig.maxInputTokens,
    maxToolCalls: defaultSessionRuntimeConfig.maxToolCalls,
    maxTotalTokens: defaultSessionRuntimeConfig.maxTotalTokens,
  }),
  maxSteps: z
    .number()
    .int()
    .positive()
    .default(defaultSessionRuntimeConfig.maxSteps),
  maxTurns: z
    .number()
    .int()
    .positive()
    .default(defaultSessionRuntimeConfig.maxTurns),
  model: ModelConfigSchema,
  repo: RepoConfigSchema.optional(),
  sandbox: SessionSandboxConfigSchema.optional(),
  systemPrompt: z.string().min(1).optional(),
  timeoutSeconds: z
    .number()
    .int()
    .positive()
    .default(defaultSessionRuntimeConfig.timeoutSeconds),
  title: z.string().min(1).max(200).optional(),
});
export type SessionConfig = z.infer<typeof SessionConfigSchema>;
