import { BenchmarkApiClient } from "@codebreaker/benchmark-runner/api-client";
import {
  BenchmarkCleanupPolicySchema,
  CreateBenchmarkRunRequestSchema,
  DifficultySchema,
} from "@codebreaker/benchmark-runner/schemas";

const usage = `Usage:
  benchmark-runner list
  benchmark-runner runs
  benchmark-runner run --task <id> --difficulty <L0|L1> --model <provider/model> [--cleanup <policy>]
  benchmark-runner inspect <runId>
  benchmark-runner cleanup <runId>

Environment:
  CODEBREAKER_API_URL  Control plane base URL
  CODEBREAKER_TOKEN    Bearer token`;

const main = async (): Promise<void> => {
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

  return new BenchmarkApiClient({
    baseUrl,
    ...(process.env.CODEBREAKER_TOKEN
      ? { token: process.env.CODEBREAKER_TOKEN }
      : {}),
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
