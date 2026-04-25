import { jsonError } from "@codebreaker/control-plane/http/errors";
import type { Env } from "@codebreaker/control-plane/types";
import { createMiddleware } from "hono/factory";

const encoder = new TextEncoder();

export const jwtAuth = createMiddleware<{ Bindings: Env }>(
  async (context, next) => {
    const header = context.req.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

    if (!(token && (await verifyJwt(token, context.env.JWT_SECRET)))) {
      return jsonError("Unauthorized", "unauthorized", 401);
    }

    await next();
  }
);

const verifyJwt = async (token: string, secret: string): Promise<boolean> => {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");

  if (!(encodedHeader && encodedPayload && encodedSignature)) {
    return false;
  }

  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signatureValid = await verifyHmacSha256(
    signatureInput,
    encodedSignature,
    secret
  );

  if (!signatureValid) {
    return false;
  }

  const payload = parseJson(base64UrlDecode(encodedPayload));

  if (!isJwtPayload(payload)) {
    return false;
  }

  return typeof payload.exp !== "number" || payload.exp * 1000 > Date.now();
};

const verifyHmacSha256 = async (
  value: string,
  encodedSignature: string,
  secret: string
): Promise<boolean> => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["verify"]
  );

  return crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToArrayBuffer(encodedSignature),
    encoder.encode(value)
  );
};

const base64UrlDecode = (value: string): string => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );

  return atob(padded);
};

const base64UrlToArrayBuffer = (value: string): ArrayBuffer => {
  const binary = base64UrlDecode(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return buffer;
};

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const isJwtPayload = (value: unknown): value is { exp?: number } =>
  typeof value === "object" && value !== null;
