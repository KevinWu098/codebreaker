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

export const SessionRowSchema = z.object({
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  id: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  modelId: z.string().min(1),
  modelProvider: ModelProviderSchema,
  outputTokens: z.number().int().nonnegative(),
  repoName: z.string().nullable(),
  repoOwner: z.string().nullable(),
  status: SessionStatusSchema,
  title: z.string().nullable(),
  turnCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
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
