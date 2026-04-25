#!/usr/bin/env node
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const devVarsPath = resolve(repoRoot, "packages/control-plane/.dev.vars");

const ttlSeconds = Number.parseInt(process.env.TTL ?? "86400", 10);
const subject = process.env.SUB ?? "operator";

const parseDevVars = (raw) => {
  const env = {};

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");

    if (eq === -1) {
      continue;
    }

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
};

let secret = process.env.JWT_SECRET;

if (!secret) {
  try {
    const env = parseDevVars(readFileSync(devVarsPath, "utf8"));
    secret = env.JWT_SECRET;
  } catch (error) {
    console.error(`Could not read ${devVarsPath}:`, error.message);
    process.exit(1);
  }
}

if (!secret) {
  console.error(
    "JWT_SECRET not found. Set it in .dev.vars or pass JWT_SECRET=... as an env var."
  );
  process.exit(1);
}

const base64UrlEncode = (input) =>
  Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const now = Math.floor(Date.now() / 1000);
const header = { alg: "HS256", typ: "JWT" };
const payload = {
  iat: now,
  exp: now + ttlSeconds,
  sub: subject,
  scope: "operator",
};

const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
  JSON.stringify(payload)
)}`;

const signature = createHmac("sha256", secret)
  .update(signingInput)
  .digest("base64")
  .replaceAll("+", "-")
  .replaceAll("/", "_")
  .replaceAll("=", "");

const token = `${signingInput}.${signature}`;

if (process.argv.includes("--quiet")) {
  process.stdout.write(token);
} else {
  process.stdout.write(`${token}\n`);
  process.stderr.write(
    `\nTTL ${ttlSeconds}s · subject ${subject} · expires ${new Date(
      (now + ttlSeconds) * 1000
    ).toISOString()}\n`
  );
}
