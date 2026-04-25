import { MODEL_PROVIDERS } from "@codebreaker/shared/lib/models";
import { z } from "zod";

export const ModelProviderSchema = z.enum(MODEL_PROVIDERS);
export type { ModelProvider } from "@codebreaker/shared/lib/models";

export const ReasoningEffortSchema = z.enum([
  "minimal",
  "low",
  "medium",
  "high",
]);
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

export const ScmProviderSchema = z.enum([
  "github",
  "gitlab",
  "bitbucket",
  "local",
]);
export type ScmProvider = z.infer<typeof ScmProviderSchema>;

export const SessionStatusSchema = z.enum([
  "pending",
  "running",
  "idle",
  "completed",
  "failed",
  "archived",
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const ExtensionPolicySchema = z.enum([
  "readonly",
  "workspace",
  "local",
  "network",
  "sandbox",
  "unrestricted",
]);
export type ExtensionPolicy = z.infer<typeof ExtensionPolicySchema>;
