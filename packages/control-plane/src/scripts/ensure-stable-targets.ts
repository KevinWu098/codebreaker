import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GitHubGitTreeStore } from "@codebreaker/control-plane/artifacts/github";
import type { Env } from "@codebreaker/control-plane/types";
import {
  loadBenchmarkTasks,
  loadInternalMetadata,
} from "@codebreaker/benchmark-runner/loaders";
import type {
  InternalMetadata,
  TaskInstance,
} from "@codebreaker/benchmark-runner/schemas";
import type { BenchmarkTargetConfig } from "@codebreaker/shared/schemas/artifacts";

const NEWLINE_RE = /\r?\n/;
const ENV_KEYS_TO_FORWARD = [
  "GITHUB_API_BASE_URL",
  "GITHUB_API_VERSION",
  "GITHUB_GIT_USERNAME",
  "GITHUB_ORG",
  "GITHUB_OWNER",
  "GITHUB_TOKEN",
  "GITHUB_USER_AGENT",
] as const;

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

const applyDevVars = (workspaceRoot: string): void => {
  const path =
    process.env.CODEBREAKER_DEV_VARS ??
    resolve(workspaceRoot, "packages/control-plane/.dev.vars");

  if (!existsSync(path)) {
    return;
  }

  const parsed = parseDevVars(readFileSync(path, "utf8"));
  for (const key of ENV_KEYS_TO_FORWARD) {
    if (!process.env[key] && parsed[key]) {
      process.env[key] = parsed[key];
    }
  }
};

const buildTarget = (
  task: TaskInstance,
  metadata: InternalMetadata | undefined
): BenchmarkTargetConfig => ({
  benchmarkId: task.task_id,
  defaultBranch: "main",
  description: `${task.task_id} vulnerable codebase`,
  ...(metadata?.post_patch_commit
    ? { patchedRef: metadata.post_patch_commit }
    : {}),
  sourceUrl: task.codebase.repo,
  targetRepoName: `target-${task.task_id}-${task.codebase.commit.slice(0, 12)}`,
  vulnerableRef: task.codebase.commit,
});

const parseArgs = (argv: string[]): { filter: Set<string> | null } => {
  const filter = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--task" || arg === "-t") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("--task requires a task id (e.g. ecvebench-deno-001)");
      }
      filter.add(value);
      i += 1;
    } else if (arg?.startsWith("--task=")) {
      filter.add(arg.slice("--task=".length));
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: ensure-stable-targets [--task <task_id> ...]\n"
      );
      process.exit(0);
    }
  }
  return { filter: filter.size > 0 ? filter : null };
};

const main = async (): Promise<void> => {
  const workspaceRoot = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../../.."
  );
  applyDevVars(workspaceRoot);

  if (!process.env.GITHUB_TOKEN) {
    throw new Error(
      "GITHUB_TOKEN is not set. Add it to packages/control-plane/.dev.vars or export it before running."
    );
  }
  if (!(process.env.GITHUB_ORG || process.env.GITHUB_OWNER)) {
    throw new Error(
      "Set GITHUB_ORG (preferred) or GITHUB_OWNER in packages/control-plane/.dev.vars before running."
    );
  }

  const { filter } = parseArgs(process.argv.slice(2));

  const [tasks, metadata] = await Promise.all([
    loadBenchmarkTasks(workspaceRoot),
    loadInternalMetadata(workspaceRoot),
  ]);

  const metadataByGhsa = new Map<string, InternalMetadata>();
  for (const entry of metadata) {
    if (!metadataByGhsa.has(entry.ghsa_id)) {
      metadataByGhsa.set(entry.ghsa_id, entry);
    }
  }

  const selected = filter
    ? tasks.filter((task) => filter.has(task.task_id))
    : tasks;

  if (filter && selected.length === 0) {
    throw new Error(
      `No tasks matched filter: ${Array.from(filter).join(", ")}`
    );
  }

  const store = GitHubGitTreeStore.fromEnv(process.env as unknown as Env);
  const owner = process.env.GITHUB_ORG ?? process.env.GITHUB_OWNER;

  process.stdout.write(
    `Ensuring ${selected.length} target repo(s) under ${owner}/...\n`
  );

  let succeeded = 0;
  const failures: Array<{ task: string; error: string }> = [];

  for (const task of selected) {
    const target = buildTarget(task, metadataByGhsa.get(task.ghsa_id));

    try {
      const repo = await store.ensureStableTarget({ target });
      succeeded += 1;
      process.stdout.write(
        `  [ok] ${task.task_id} -> ${repo.htmlUrl ?? repo.fullName}\n`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ error: message, task: task.task_id });
      process.stdout.write(`  [err] ${task.task_id}: ${message}\n`);
    }
  }

  process.stdout.write(
    `\nDone. ${succeeded} ok, ${failures.length} failed (out of ${selected.length}).\n`
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
