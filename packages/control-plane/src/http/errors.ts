import { type ApiError, ApiErrorSchema } from "@codebreaker/shared/schemas/api";

export const jsonError = (
  message: string,
  code: string,
  status: number,
  details?: unknown
): Response => {
  const body: ApiError = ApiErrorSchema.parse({
    code,
    details,
    message,
  });

  return Response.json(body, { status });
};
