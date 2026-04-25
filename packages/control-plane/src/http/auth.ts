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

    // hono/jwt's `exp: true` only validates the claim *if it is present* —
    // a token with no `exp` at all silently passes verify(). This explicit
    // check is what enforces "missing exp = reject"; do not remove.
    if (typeof payload.exp !== "number") {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};

const isWebSocketUpgrade = (request: Request): boolean =>
  request.headers.get("upgrade")?.toLowerCase() === "websocket";

const extractBearerToken = (request: Request): string | null => {
  const header = request.headers.get("authorization");

  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }

  // Browsers can't set `Authorization` on WebSocket upgrades, so we accept the
  // token via `?token=` for that case only. Allowing it on regular HTTP would
  // let tokens leak into request logs and browser history.
  if (!isWebSocketUpgrade(request)) {
    return null;
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
