import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type GhsaId,
  type InternalMetadata,
  InternalMetadataSchema,
  type TaskInstance,
  TaskInstanceSchema,
} from "@codebreaker/benchmark-runner/schemas";
import type { ZodType, z } from "zod";

const DEFAULT_TASKS_PATH = "benchmark/data/tasks.jsonl";
const DEFAULT_METADATA_PATH = "benchmark/internal/metadata.jsonl";
const JSONL_LINE_SEPARATOR = /\r?\n/;

export interface JsonlRecord<T> {
  line: number;
  source: string;
  value: T;
}

export class BenchmarkValidationError extends Error {
  readonly details: string[];
  readonly line: number | undefined;
  readonly source: string;

  constructor(options: {
    cause?: unknown;
    details: string[];
    line?: number;
    source: string;
  }) {
    const location =
      options.line === undefined
        ? options.source
        : `${options.source}:${options.line}`;
    super(`${location}: ${options.details.join("; ")}`, {
      cause: options.cause,
    });
    this.name = "BenchmarkValidationError";
    this.details = options.details;
    this.line = options.line;
    this.source = options.source;
  }
}

export type BenchmarkJoinIssue =
  | {
      ghsa_id: GhsaId;
      task_ids: string[];
      type: "missing-metadata";
    }
  | {
      count: number;
      ghsa_id: GhsaId;
      type: "duplicate-metadata";
    };

export interface BenchmarkTaskRecord {
  metadata: InternalMetadata;
  task: TaskInstance;
}

export interface BenchmarkJoinResult {
  issues: BenchmarkJoinIssue[];
  records: BenchmarkTaskRecord[];
}

const formatZodIssues = (error: z.ZodError): string[] =>
  error.issues.map((issue) => {
    const path = issue.path.length === 0 ? "<root>" : issue.path.join(".");
    return `${path}: ${issue.message}`;
  });

const formatUnknownError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const parseJsonValue = (
  line: string,
  lineNumber: number,
  source: string
): unknown => {
  try {
    return JSON.parse(line) as unknown;
  } catch (error) {
    throw new BenchmarkValidationError({
      cause: error,
      details: [`invalid JSON: ${formatUnknownError(error)}`],
      line: lineNumber,
      source,
    });
  }
};

const parseRecordValue = <T>(
  value: unknown,
  schema: ZodType<T>,
  line: number,
  source: string
): T => {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new BenchmarkValidationError({
      cause: result.error,
      details: formatZodIssues(result.error),
      line,
      source,
    });
  }

  return result.data;
};

export const parseJsonlRecords = <T>(
  contents: string,
  schema: ZodType<T>,
  source = "<jsonl>"
): JsonlRecord<T>[] => {
  const records: JsonlRecord<T>[] = [];
  const lines = contents.split(JSONL_LINE_SEPARATOR);

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();

    if (line.length === 0) {
      continue;
    }

    const lineNumber = index + 1;
    const value = parseJsonValue(line, lineNumber, source);
    records.push({
      line: lineNumber,
      source,
      value: parseRecordValue(value, schema, lineNumber, source),
    });
  }

  return records;
};

export const parseJsonl = <T>(
  contents: string,
  schema: ZodType<T>,
  source = "<jsonl>"
): T[] =>
  parseJsonlRecords(contents, schema, source).map((record) => record.value);

export const loadJsonlFile = async <T>(
  filePath: string,
  schema: ZodType<T>
): Promise<T[]> => {
  const contents = await readFile(filePath, "utf8");
  return parseJsonl(contents, schema, filePath);
};

export const loadBenchmarkTasks = async (
  workspaceRoot = process.cwd()
): Promise<TaskInstance[]> =>
  loadJsonlFile(join(workspaceRoot, DEFAULT_TASKS_PATH), TaskInstanceSchema);

export const loadInternalMetadata = async (
  workspaceRoot = process.cwd()
): Promise<InternalMetadata[]> =>
  loadJsonlFile(
    join(workspaceRoot, DEFAULT_METADATA_PATH),
    InternalMetadataSchema
  );

const groupMetadataByGhsa = (
  metadata: InternalMetadata[]
): Map<GhsaId, InternalMetadata[]> => {
  const metadataByGhsa = new Map<GhsaId, InternalMetadata[]>();

  for (const entry of metadata) {
    const entries = metadataByGhsa.get(entry.ghsa_id) ?? [];
    entries.push(entry);
    metadataByGhsa.set(entry.ghsa_id, entries);
  }

  return metadataByGhsa;
};

const groupTasksByGhsa = (
  tasks: TaskInstance[]
): Map<GhsaId, TaskInstance[]> => {
  const tasksByGhsa = new Map<GhsaId, TaskInstance[]>();

  for (const task of tasks) {
    const entries = tasksByGhsa.get(task.ghsa_id) ?? [];
    entries.push(task);
    tasksByGhsa.set(task.ghsa_id, entries);
  }

  return tasksByGhsa;
};

export const joinTasksWithInternalMetadata = (
  tasks: TaskInstance[],
  metadata: InternalMetadata[]
): BenchmarkJoinResult => {
  const metadataByGhsa = groupMetadataByGhsa(metadata);
  const tasksByGhsa = groupTasksByGhsa(tasks);
  const issues: BenchmarkJoinIssue[] = [];
  const records: BenchmarkTaskRecord[] = [];

  for (const [ghsaId, entries] of metadataByGhsa) {
    if (entries.length > 1) {
      issues.push({
        count: entries.length,
        ghsa_id: ghsaId,
        type: "duplicate-metadata",
      });
    }
  }

  for (const [ghsaId, taskEntries] of tasksByGhsa) {
    const metadataEntries = metadataByGhsa.get(ghsaId) ?? [];

    if (metadataEntries.length === 0) {
      issues.push({
        ghsa_id: ghsaId,
        task_ids: taskEntries.map((task) => task.task_id),
        type: "missing-metadata",
      });
      continue;
    }

    if (metadataEntries.length === 1) {
      const metadataEntry = metadataEntries.at(0);

      if (metadataEntry === undefined) {
        continue;
      }

      for (const task of taskEntries) {
        records.push({ metadata: metadataEntry, task });
      }
    }
  }

  return { issues, records };
};

export const formatBenchmarkJoinIssue = (issue: BenchmarkJoinIssue): string => {
  if (issue.type === "missing-metadata") {
    return `${issue.ghsa_id}: missing internal metadata for task(s) ${issue.task_ids.join(
      ", "
    )}`;
  }

  return `${issue.ghsa_id}: duplicate internal metadata records (${issue.count})`;
};

export const assertBenchmarkMetadataJoin = (
  result: BenchmarkJoinResult,
  source = "benchmark metadata"
): BenchmarkTaskRecord[] => {
  if (result.issues.length > 0) {
    throw new BenchmarkValidationError({
      details: result.issues.map(formatBenchmarkJoinIssue),
      source,
    });
  }

  return result.records;
};

export const loadBenchmarkDataset = async (
  workspaceRoot = process.cwd()
): Promise<BenchmarkTaskRecord[]> => {
  const [tasks, metadata] = await Promise.all([
    loadBenchmarkTasks(workspaceRoot),
    loadInternalMetadata(workspaceRoot),
  ]);

  return assertBenchmarkMetadataJoin(
    joinTasksWithInternalMetadata(tasks, metadata)
  );
};
