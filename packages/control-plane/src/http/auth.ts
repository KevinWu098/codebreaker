import { jsonError } from "@codebreaker/control-plane/http/errors";
import type { Env } from "@codebreaker/control-plane/types";
import { createMiddleware } from "hono/factory";
import { verify } from "hono/jwt";

const JWT_ALG = "HS256";

export const verifyJwt = async (
  token: string,
  secret: string
): Promise<boolean> => {
  try {
    const payload = await verify(token, secret, {
      alg: JWT_ALG,
      exp: true,
      iat: true,
      nbf: true,
    });

    if (typeof payload.exp !== "number") {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

const extractBearerToken = (request: Request): string | null => {
  const header = request.headers.get("authorization");

  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }

  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");

  return queryToken && queryToken.length > 0 ? queryToken : null;
};

export const verifyRequestJwt = async (
  request: Request,
  secret: string
): Promise<boolean> => {
  const token = extractBearerToken(request);

  if (!token) {
    return false;
  }

  return await verifyJwt(token, secret);
};

export const jwtAuth = createMiddleware<{ Bindings: Env }>(
  async (context, next) => {
    if (!(await verifyRequestJwt(context.req.raw, context.env.JWT_SECRET))) {
      return jsonError("Unauthorized", "unauthorized", 401);
    }

    await next();
  }
);
