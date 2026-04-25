/**
 * CORS support for routes that bypass the Hono router (e.g. `/agents/...`
 * handled directly by `routeAgentRequest`).
 *
 * Origins are gated on the `ALLOWED_ORIGINS` env var (comma-separated). If the
 * var is empty, no CORS headers are emitted at all and browser cross-origin
 * requests will be blocked by the user agent. Use `*` to allow everything
 * (not recommended in prod).
 */

import type { Env } from "@codebreaker/control-plane/types";

const ORIGIN_SEPARATOR = /\s*,\s*/;

const ALLOWED_HEADERS =
  "authorization,content-type,x-requested-with,x-partykit-room";

const ALLOWED_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";

export const parseAllowedOrigins = (raw: string | undefined): string[] => {
  if (!raw) {
    return [];
  }

  return raw
    .split(ORIGIN_SEPARATOR)
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
};

export const isOriginAllowed = (
  origin: string | null,
  allowedOrigins: readonly string[]
): boolean => {
  if (allowedOrigins.includes("*")) {
    return true;
  }

  if (!origin) {
    return false;
  }

  return allowedOrigins.includes(origin);
};

const resolveAllowedOrigin = (
  origin: string | null,
  env: Env
): string | null => {
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);

  if (allowedOrigins.length === 0) {
    return null;
  }

  if (!isOriginAllowed(origin, allowedOrigins)) {
    return null;
  }

  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }

  if (allowedOrigins.includes("*")) {
    return origin ?? "*";
  }

  return allowedOrigins[0] ?? null;
};

export const buildCorsHeaders = (
  origin: string | null,
  env: Env
): Headers | null => {
  const allowOrigin = resolveAllowedOrigin(origin, env);

  if (!allowOrigin) {
    return null;
  }

  const headers = new Headers();

  headers.set("access-control-allow-origin", allowOrigin);
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-allow-headers", ALLOWED_HEADERS);
  headers.set("access-control-allow-methods", ALLOWED_METHODS);
  headers.set("access-control-max-age", "600");
  headers.set("vary", "Origin");

  return headers;
};

export const handlePreflight = (
  request: Request,
  env: Env
): Response | undefined => {
  if (request.method !== "OPTIONS") {
    return;
  }

  const headers = buildCorsHeaders(request.headers.get("origin"), env);

  if (!headers) {
    return new Response(null, { status: 403 });
  }

  const requestedHeaders = request.headers.get(
    "access-control-request-headers"
  );

  if (requestedHeaders) {
    headers.set("access-control-allow-headers", requestedHeaders);
  }

  return new Response(null, { headers, status: 204 });
};

export const withCorsHeaders = (
  response: Response,
  origin: string | null,
  env: Env
): Response => {
  const cors = buildCorsHeaders(origin, env);

  if (!cors) {
    return response;
  }

  const headers = new Headers(response.headers);

  cors.forEach((value, name) => {
    headers.set(name, value);
  });

  if (response.webSocket) {
    return new Response(null, {
      headers,
      status: response.status,
      statusText: response.statusText,
      webSocket: response.webSocket,
    });
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};
