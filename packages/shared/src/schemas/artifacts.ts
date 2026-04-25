import { z } from "zod";

export const GitTreeProviderSchema = z.enum([
  "forgejo",
  "cloudflare-artifacts",
]);
export type GitTreeProvider = z.infer<typeof GitTreeProviderSchema>;

export const ArtifactRepoKindSchema = z.enum(["stable_target", "per_run"]);
export type ArtifactRepoKind = z.infer<typeof ArtifactRepoKindSchema>;

export const ArtifactCredentialScopeSchema = z.enum(["read", "write"]);
export type ArtifactCredentialScope = z.infer<
  typeof ArtifactCredentialScopeSchema
>;

export const BenchmarkArtifactStatusSchema = z.enum([
  "pending",
  "draft",
  "validated",
  "failed",
]);
export type BenchmarkArtifactStatus = z.infer<
  typeof BenchmarkArtifactStatusSchema
>;

export const BenchmarkTargetConfigSchema = z.object({
  benchmarkId: z.string().min(1),
  defaultBranch: z.string().min(1).default("main"),
  description: z.string().min(1).optional(),
  patchedRef: z.string().min(1).optional(),
  setupNotes: z.string().min(1).optional(),
  sourceBranch: z.string().min(1).optional(),
  sourceDepth: z.number().int().positive().optional(),
  sourceUrl: z.string().url().optional(),
  targetRepoName: z.string().min(1).optional(),
  vulnerableRef: z.string().min(1).optional(),
});
export type BenchmarkTargetConfig = z.infer<typeof BenchmarkTargetConfigSchema>;

export const BenchmarkArtifactsConfigSchema = z.object({
  agentId: z.string().min(1).optional(),
  runRepoName: z.string().min(1).optional(),
  workingBranch: z.string().min(1).default("main"),
});
export type BenchmarkArtifactsConfig = z.infer<
  typeof BenchmarkArtifactsConfigSchema
>;

export const BenchmarkConfigSchema = z.object({
  artifacts: BenchmarkArtifactsConfigSchema.default({
    workingBranch: "main",
  }),
  target: BenchmarkTargetConfigSchema,
});
export type BenchmarkConfig = z.infer<typeof BenchmarkConfigSchema>;

export const BenchmarkArtifactStateSchema = z.object({
  artifactPath: z.string().min(1).optional(),
  benchmarkId: z.string().min(1),
  defaultBranch: z.string().min(1),
  latestCommitSha: z.string().min(1).optional(),
  patchedEvidencePath: z.string().min(1).optional(),
  provider: GitTreeProviderSchema,
  runCommand: z.string().min(1).optional(),
  runRepoName: z.string().min(1),
  runRepoRemote: z.string().url(),
  status: BenchmarkArtifactStatusSchema.default("pending"),
  targetRepoName: z.string().min(1),
  targetRepoRemote: z.string().url(),
  vulnerableEvidencePath: z.string().min(1).optional(),
  workingBranch: z.string().min(1),
});
export type BenchmarkArtifactState = z.infer<
  typeof BenchmarkArtifactStateSchema
>;

export const GitCheckoutResultSchema = z.object({
  commitSha: z.string().min(1).optional(),
  repoPath: z.string().min(1),
});
export type GitCheckoutResult = z.infer<typeof GitCheckoutResultSchema>;

export const GitCommitResultSchema = GitCheckoutResultSchema.extend({
  pushed: z.boolean(),
});
export type GitCommitResult = z.infer<typeof GitCommitResultSchema>;
