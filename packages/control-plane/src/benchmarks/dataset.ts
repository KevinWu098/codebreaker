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
import { benchmarkDatasetFixtures } from "./fixtures.js";

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
    const tasks = benchmarkDatasetFixtures.tasks.map((task) =>
      TaskInstanceSchema.parse(task)
    );
    const metadata = benchmarkDatasetFixtures.metadata.map((entry) =>
      InternalMetadataSchema.parse(entry)
    );

    return joinTasksWithMetadata(tasks, metadata);
  }
}

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
