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
