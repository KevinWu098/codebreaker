import type { Env } from "@codebreaker/control-plane/types";

const ORIGIN_SEPARATOR = /\s*,\s*/;

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

export const buildCorsHeaders = (
  request: Request,
  env: Env
): HeadersInit | undefined => {
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);

  if (allowedOrigins.length === 0) {
    return;
  }

  const origin = request.headers.get("Origin");

  if (!isOriginAllowed(origin, allowedOrigins)) {
    return;
  }

  const allowOrigin =
    origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  if (!allowOrigin) {
    return;
  }

  return {
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS, DELETE",
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
};
