import type {
  BenchmarkTaskSummary,
  GhsaId,
  InternalMetadata,
  TaskInstance,
} from "@codebreaker/benchmark-runner/schemas";
import {
  InternalMetadataSchema,
  summarizeTask,
  TaskInstanceSchema,
} from "@codebreaker/benchmark-runner/schemas";
import type { BenchmarkTaskRecord } from "@codebreaker/benchmark-runner/session-config";
import type { ZodType, z } from "zod";
import { benchmarkDatasetFixtures } from "./fixtures.js";

const JSONL_LINE_SEPARATOR = /\r?\n/;

export class BenchmarkDatasetService {
  listTasks(): BenchmarkTaskSummary[] {
    return this.loadDataset().map(({ task }) => summarizeTask(task));
  }

  getTaskRecord(taskId: string): BenchmarkTaskRecord {
    const record = this.loadDataset().find(
      ({ task }) => task.task_id === taskId
    );

    if (!record) {
      throw new Error(`Benchmark task ${taskId} not found`);
    }

    return record;
  }

  getTask(taskId: string): TaskInstance {
    return this.getTaskRecord(taskId).task;
  }

  private loadDataset(): BenchmarkTaskRecord[] {
    const tasks = parseJsonl(
      benchmarkDatasetFixtures.tasksJsonl,
      TaskInstanceSchema,
      "benchmark/data/tasks.jsonl"
    );
    const metadata = parseJsonl(
      benchmarkDatasetFixtures.metadataJsonl,
      InternalMetadataSchema,
      "benchmark/internal/metadata.jsonl"
    );

    return joinTasksWithMetadata(tasks, metadata);
  }
}

const parseJsonl = <T>(
  contents: string,
  schema: ZodType<T>,
  source: string
): T[] => {
  const records: T[] = [];

  for (const [index, rawLine] of contents
    .split(JSONL_LINE_SEPARATOR)
    .entries()) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    const parsed = JSON.parse(line) as unknown;
    const result = schema.safeParse(parsed);

    if (!result.success) {
      throw new Error(formatZodError(result.error, source, index + 1));
    }

    records.push(result.data);
  }

  return records;
};

const joinTasksWithMetadata = (
  tasks: TaskInstance[],
  metadata: InternalMetadata[]
): BenchmarkTaskRecord[] => {
  const metadataByGhsa = new Map<GhsaId, InternalMetadata>();

  for (const entry of metadata) {
    if (metadataByGhsa.has(entry.ghsa_id)) {
      throw new Error(`Duplicate metadata for ${entry.ghsa_id}`);
    }

    metadataByGhsa.set(entry.ghsa_id, entry);
  }

  return tasks.map((task) => {
    const entry = metadataByGhsa.get(task.ghsa_id);

    if (!entry) {
      throw new Error(`Missing metadata for ${task.ghsa_id}`);
    }

    return {
      metadata: entry,
      task,
    };
  });
};

const formatZodError = (
  error: z.ZodError,
  source: string,
  line: number
): string => {
  const details = error.issues
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");

  return `Invalid benchmark JSONL at ${source}:${line}: ${details}`;
};
