import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BenchmarkApiClient } from "@codebreaker/benchmark-runner/api-client";
import {
  BenchmarkCleanupPolicySchema,
  CreateBenchmarkRunRequestSchema,
  DifficultySchema,
} from "@codebreaker/benchmark-runner/schemas";

const NEWLINE_RE = /\r?\n/;

const parseDevVars = (raw: string): Record<string, string> => {
  const env: Record<string, string> = {};

  for (const line of raw.split(NEWLINE_RE)) {
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

const controlPlaneDevVarsPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../control-plane/.dev.vars"
);

/**
 * Picks up CODEBREAKER_API_URL and CODEBREAKER_TOKEN from the same
 * `packages/control-plane/.dev.vars` the worker uses (so you can paste a JWT
 * on one line and run `benchmark list` with no extra exports).
 * Env vars already set take precedence. Override the file path with
 * CODEBREAKER_DEV_VARS.
 */
const applyBenchmarkEnvFromControlPlaneDevVars = (): void => {
  const path = process.env.CODEBREAKER_DEV_VARS ?? controlPlaneDevVarsPath;

  if (!existsSync(path)) {
    return;
  }

  const parsed = parseDevVars(readFileSync(path, "utf8"));
  for (const key of ["CODEBREAKER_API_URL", "CODEBREAKER_TOKEN"] as const) {
    if (!process.env[key] && parsed[key]) {
      process.env[key] = parsed[key];
    }
  }
};

const usage = `Usage:
  benchmark-runner list
  benchmark-runner runs
  benchmark-runner run --task <id> --difficulty <L0|L1> --model <provider/model> [--cleanup <policy>]
  benchmark-runner inspect <runId>
  benchmark-runner cleanup <runId>

Environment:
  CODEBREAKER_API_URL  Control plane base URL (defaults to http://127.0.0.1:8787 for local)
  CODEBREAKER_TOKEN    Bearer token (optional: set in packages/control-plane/.dev.vars)
  CODEBREAKER_DEV_VARS Path to a .dev.vars-style file (default: control-plane .dev.vars)`;

const main = async (): Promise<void> => {
  applyBenchmarkEnvFromControlPlaneDevVars();

  if (!process.env.CODEBREAKER_API_URL) {
    process.env.CODEBREAKER_API_URL = "http://127.0.0.1:8787";
  }

  const [command, ...args] = process.argv.slice(2);
  const client = createClient();

  switch (command) {
    case "list": {
      const response = await client.listTasks();
      process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
      return;
    }
    case "runs": {
      const response = await client.listRuns();
      process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
      return;
    }
    case "run": {
      const flags = parseFlags(args);
      const taskId = requireFlag(flags, "task");
      const difficulty = DifficultySchema.parse(
        requireFlag(flags, "difficulty")
      );
      const model = parseModel(requireFlag(flags, "model"));
      const cleanupPolicy = BenchmarkCleanupPolicySchema.parse(
        flags.cleanup ?? "retain"
      );
      const request = CreateBenchmarkRunRequestSchema.parse({
        cleanupPolicy,
        difficulty,
        model,
        taskId,
      });
      const response = await client.createRun(request);
      process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
      return;
    }
    case "inspect": {
      const runId = args.at(0);

      if (!runId) {
        throw new Error("inspect requires a run id");
      }

      const response = await client.getRun(runId);
      process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
      return;
    }
    case "cleanup": {
      const runId = args.at(0);

      if (!runId) {
        throw new Error("cleanup requires a run id");
      }

      const response = await client.cleanupRun(runId);
      process.stdout.write(`${JSON.stringify(response, null, 2)}\n`);
      return;
    }
    default:
      process.stdout.write(`${usage}\n`);
  }
};

const createClient = (): BenchmarkApiClient => {
  const baseUrl = process.env.CODEBREAKER_API_URL;

  if (!baseUrl) {
    throw new Error("CODEBREAKER_API_URL is required");
  }

  const token = process.env.CODEBREAKER_TOKEN;

  if (!token) {
    throw new Error(
      "CODEBREAKER_TOKEN is required: export it, or add CODEBREAKER_TOKEN=... to packages/control-plane/.dev.vars (run pnpm dev:token and paste the JWT)"
    );
  }

  return new BenchmarkApiClient({
    baseUrl,
    token,
  });
};

const parseFlags = (args: string[]): Record<string, string> => {
  const flags: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];

    if (!(key?.startsWith("--") && value)) {
      throw new Error(`Invalid flag near ${key ?? "<end>"}`);
    }

    flags[key.slice(2)] = value;
  }

  return flags;
};

const requireFlag = (flags: Record<string, string>, name: string): string => {
  const value = flags[name];

  if (!value) {
    throw new Error(`Missing --${name}`);
  }

  return value;
};

const parseModel = (value: string): { id: string; provider: string } => {
  const [provider, ...idParts] = value.split("/");
  const id = idParts.join("/");

  if (!(provider && id)) {
    throw new Error("Model must be formatted as provider/model-id");
  }

  return { id, provider };
};

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
