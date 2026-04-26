import {
  BenchmarkArtifactStateSchema,
  BenchmarkArtifactStatusSchema,
  GitCheckoutResultSchema,
  GitCommitResultSchema,
} from "@codebreaker/shared/schemas/artifacts";
import {
  ModelProviderSchema,
  SessionStatusSchema,
} from "@codebreaker/shared/schemas/primitives";
import {
  ExecResultSchema,
  SandboxProfileNameSchema,
} from "@codebreaker/shared/schemas/sandbox";
import { SessionConfigSchema } from "@codebreaker/shared/schemas/session";
import { z } from "zod";

export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  details: z.unknown().optional(),
  message: z.string().min(1),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const CreateSessionRequestSchema = z.object({
  config: SessionConfigSchema,
  id: z.string().min(1).optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export const FinalizeSessionRequestSchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});
export type FinalizeSessionRequest = z.infer<
  typeof FinalizeSessionRequestSchema
>;

export const SessionRowSchema = z.object({
  artifactLatestCommitSha: z.string().nullable(),
  artifactPath: z.string().nullable(),
  artifactStatus: BenchmarkArtifactStatusSchema.nullable(),
  artifactWorkingBranch: z.string().nullable(),
  benchmarkId: z.string().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  id: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  modelId: z.string().min(1),
  modelProvider: ModelProviderSchema,
  outputTokens: z.number().int().nonnegative(),
  repoName: z.string().nullable(),
  repoOwner: z.string().nullable(),
  runCommand: z.string().nullable(),
  runRepoName: z.string().nullable(),
  runRepoRemote: z.string().nullable(),
  status: SessionStatusSchema,
  targetRepoName: z.string().nullable(),
  targetRepoRemote: z.string().nullable(),
  title: z.string().nullable(),
  turnCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  vulnerableEvidencePath: z.string().nullable(),
  patchedEvidencePath: z.string().nullable(),
});
export type SessionRow = z.infer<typeof SessionRowSchema>;

export const CreateSessionResponseSchema = z.object({
  session: SessionRowSchema,
});
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>;

export const SessionDetailResponseSchema = z.object({
  session: SessionRowSchema,
});
export type SessionDetailResponse = z.infer<typeof SessionDetailResponseSchema>;

export const ListSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
  status: SessionStatusSchema.optional(),
});
export type ListSessionsQuery = z.infer<typeof ListSessionsQuerySchema>;

export const ListSessionsResponseSchema = z.object({
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  sessions: z.array(SessionRowSchema),
  total: z.number().int().nonnegative(),
});
export type ListSessionsResponse = z.infer<typeof ListSessionsResponseSchema>;

export const InspectExecRequestSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().min(1).optional(),
  profile: SandboxProfileNameSchema.optional(),
  timeoutSeconds: z.number().int().positive().optional(),
});
export type InspectExecRequest = z.infer<typeof InspectExecRequestSchema>;

export const InspectExecResponseSchema = z.object({
  result: ExecResultSchema,
});
export type InspectExecResponse = z.infer<typeof InspectExecResponseSchema>;

export const ArtifactCheckoutRequestSchema = z.object({
  path: z.string().min(1).optional(),
  profile: SandboxProfileNameSchema.optional(),
  ref: z.string().min(1).optional(),
});
export type ArtifactCheckoutRequest = z.infer<
  typeof ArtifactCheckoutRequestSchema
>;

export const ArtifactCheckoutResponseSchema = z.object({
  artifact: BenchmarkArtifactStateSchema,
  result: GitCheckoutResultSchema,
});
export type ArtifactCheckoutResponse = z.infer<
  typeof ArtifactCheckoutResponseSchema
>;

export const ArtifactCommitRequestSchema = z.object({
  message: z.string().min(1),
  paths: z.array(z.string().min(1)).default(["."]),
  profile: SandboxProfileNameSchema.optional(),
});
export type ArtifactCommitRequest = z.infer<typeof ArtifactCommitRequestSchema>;

export const ArtifactCommitResponseSchema = z.object({
  artifact: BenchmarkArtifactStateSchema,
  result: GitCommitResultSchema,
});
export type ArtifactCommitResponse = z.infer<
  typeof ArtifactCommitResponseSchema
>;

export const SessionArtifactResponseSchema = z.object({
  artifact: BenchmarkArtifactStateSchema.nullable(),
});
export type SessionArtifactResponse = z.infer<
  typeof SessionArtifactResponseSchema
>;

export const UpdateArtifactStateRequestSchema =
  BenchmarkArtifactStateSchema.pick({
    artifactPath: true,
    latestCommitSha: true,
    patchedEvidencePath: true,
    runCommand: true,
    status: true,
    vulnerableEvidencePath: true,
  }).partial();
export type UpdateArtifactStateRequest = z.infer<
  typeof UpdateArtifactStateRequestSchema
>;

export const SessionMessagesResponseSchema = z.object({
  messages: z.array(z.unknown()),
});
export type SessionMessagesResponse = z.infer<
  typeof SessionMessagesResponseSchema
>;

export const SessionConfigResponseSchema = z.object({
  config: SessionConfigSchema.nullable(),
});
export type SessionConfigResponse = z.infer<typeof SessionConfigResponseSchema>;

export const SessionAgentStateSchema = z.object({
  artifact: BenchmarkArtifactStateSchema.optional(),
  control: z
    .object({
      benchmarkSubmitMode: z.boolean().optional(),
      finalizing: z.boolean().optional(),
      inputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative().optional(),
      stopReason: z.string().optional(),
      toolCalls: z.number().int().nonnegative().optional(),
    })
    .optional(),
  pendingBenchmarkOutputs: z.array(z.unknown()).optional(),
  sessionId: z.string().min(1).optional(),
  status: SessionStatusSchema,
});
export type SessionAgentState = z.infer<typeof SessionAgentStateSchema>;

export const SessionStateResponseSchema = z.object({
  state: SessionAgentStateSchema,
});
export type SessionStateResponse = z.infer<typeof SessionStateResponseSchema>;

export const SandboxMetadataSchema = z.object({
  created_at: z.number(),
  image_fingerprint: z.string().min(1),
  profile: SandboxProfileNameSchema,
  sandbox_id: z.string().min(1),
  session_id: z.string().min(1),
  snapshot_id: z.string().nullable().optional(),
});
export type SandboxMetadata = z.infer<typeof SandboxMetadataSchema>;

export const SessionSandboxResponseSchema = z.object({
  sandbox: SandboxMetadataSchema.nullable(),
});
export type SessionSandboxResponse = z.infer<
  typeof SessionSandboxResponseSchema
>;

export const AdminShimHealthResponseSchema = z.object({
  health: z.unknown(),
});
export type AdminShimHealthResponse = z.infer<
  typeof AdminShimHealthResponseSchema
>;

export const AdminShimSandboxesResponseSchema = z.object({
  sandboxes: z.array(SandboxMetadataSchema),
});
export type AdminShimSandboxesResponse = z.infer<
  typeof AdminShimSandboxesResponseSchema
>;
