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
  maxContextTokens: z.number().int().positive().default(128_000),
  preserveRecentMessages: z.number().int().nonnegative().default(12),
  summarizeAtTokens: z.number().int().positive().default(96_000),
});
export type CompactionConfig = z.infer<typeof CompactionConfigSchema>;

export const defaultCompactionConfig = {
  enabled: true,
  maxContextTokens: 128_000,
  preserveRecentMessages: 12,
  summarizeAtTokens: 96_000,
} as const satisfies CompactionConfig;

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

export const SessionConfigSchema = z.object({
  compaction: CompactionConfigSchema.default(defaultCompactionConfig),
  extensionPolicy: ExtensionPolicySchema.default("readonly"),
  maxSteps: z.number().int().positive().default(10),
  maxTurns: z.number().int().positive().default(25),
  model: ModelConfigSchema,
  repo: RepoConfigSchema.optional(),
  sandbox: SessionSandboxConfigSchema.optional(),
  systemPrompt: z.string().min(1).optional(),
  timeoutSeconds: z.number().int().positive().default(3600),
  title: z.string().min(1).max(200).optional(),
});
export type SessionConfig = z.infer<typeof SessionConfigSchema>;
