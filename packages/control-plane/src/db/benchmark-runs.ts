import type {
  AgentOutput,
  BenchmarkCleanupPolicy,
  BenchmarkRunEvent,
  BenchmarkRunEventKind,
  BenchmarkRunResult,
  BenchmarkRunRow,
  BenchmarkRunScore,
  BenchmarkRunStatus,
  Difficulty,
} from "@codebreaker/benchmark-runner/schemas";
import {
  BenchmarkRunEventSchema,
  BenchmarkRunResultSchema,
  BenchmarkRunRowSchema,
} from "@codebreaker/benchmark-runner/schemas";
import type { ModelProvider } from "@codebreaker/shared/lib/models";
import { nowIso } from "@codebreaker/shared/lib/utils";

interface BenchmarkRunRecord {
  artifact_commit_sha: string | null;
  artifact_path: string | null;
  cleanup_completed_at: string | null;
  cleanup_policy: BenchmarkCleanupPolicy;
  completed_at: string | null;
  created_at: string;
  difficulty: Difficulty;
  error: string | null;
  id: string;
  model_id: string;
  model_provider: ModelProvider;
  score: number | null;
  session_id: string | null;
  status: BenchmarkRunStatus;
  task_id: string;
  updated_at: string;
}

interface BenchmarkRunEventRecord {
  created_at: string;
  details: string | null;
  id: string;
  kind: BenchmarkRunEventKind;
  message: string;
  run_id: string;
}

interface BenchmarkRunResultRecord {
  agent_output: string | null;
  artifact_path: string | null;
  created_at: string;
  error: string | null;
  id: string;
  raw_output: string | null;
  run_id: string;
  score: string | null;
}

export interface CreateBenchmarkRunInput {
  cleanupPolicy: BenchmarkCleanupPolicy;
  difficulty: Difficulty;
  id: string;
  modelId: string;
  modelProvider: ModelProvider;
  taskId: string;
}

export interface UpdateBenchmarkRunInput {
  artifactCommitSha?: string | null;
  artifactPath?: string | null;
  cleanupCompletedAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
  id: string;
  score?: number | null;
  sessionId?: string | null;
  status?: BenchmarkRunStatus;
}

export class BenchmarkRunStore {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async create(input: CreateBenchmarkRunInput): Promise<BenchmarkRunRow> {
    const timestamp = nowIso();

    await this.db
      .prepare(
        `insert into benchmark_runs (
          id,
          task_id,
          difficulty,
          status,
          model_provider,
          model_id,
          cleanup_policy,
          created_at,
          updated_at
        ) values (?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.taskId,
        input.difficulty,
        input.modelProvider,
        input.modelId,
        input.cleanupPolicy,
        timestamp,
        timestamp
      )
      .run();

    await this.addEvent({
      kind: "created",
      message: "Benchmark run created",
      runId: input.id,
    });

    const run = await this.get(input.id);

    if (!run) {
      throw new Error(`Benchmark run ${input.id} was not written`);
    }

    return run;
  }

  async list(): Promise<BenchmarkRunRow[]> {
    const result = await this.db
      .prepare("select * from benchmark_runs order by created_at desc")
      .all<BenchmarkRunRecord>();

    return result.results.map((row) => this.toRun(row));
  }

  async get(id: string): Promise<BenchmarkRunRow | null> {
    const row = await this.db
      .prepare("select * from benchmark_runs where id = ?")
      .bind(id)
      .first<BenchmarkRunRecord>();

    return row ? this.toRun(row) : null;
  }

  async update(input: UpdateBenchmarkRunInput): Promise<BenchmarkRunRow> {
    const current = await this.get(input.id);

    if (!current) {
      throw new Error(`Benchmark run ${input.id} not found`);
    }

    const timestamp = nowIso();
    const next = {
      artifactCommitSha:
        input.artifactCommitSha === undefined
          ? current.artifactCommitSha
          : input.artifactCommitSha,
      artifactPath:
        input.artifactPath === undefined
          ? current.artifactPath
          : input.artifactPath,
      cleanupCompletedAt:
        input.cleanupCompletedAt === undefined
          ? current.cleanupCompletedAt
          : input.cleanupCompletedAt,
      completedAt:
        input.completedAt === undefined
          ? current.completedAt
          : input.completedAt,
      error: input.error === undefined ? current.error : input.error,
      score: input.score === undefined ? current.score : input.score,
      sessionId:
        input.sessionId === undefined ? current.sessionId : input.sessionId,
      status: input.status ?? current.status,
    };

    await this.db
      .prepare(
        `update benchmark_runs
        set status = ?,
          session_id = ?,
          artifact_commit_sha = ?,
          artifact_path = ?,
          score = ?,
          error = ?,
          updated_at = ?,
          completed_at = ?,
          cleanup_completed_at = ?
        where id = ?`
      )
      .bind(
        next.status,
        next.sessionId,
        next.artifactCommitSha,
        next.artifactPath,
        next.score,
        next.error,
        timestamp,
        next.completedAt,
        next.cleanupCompletedAt,
        input.id
      )
      .run();

    const run = await this.get(input.id);

    if (!run) {
      throw new Error(`Benchmark run ${input.id} disappeared`);
    }

    return run;
  }

  async addEvent(input: {
    details?: unknown;
    kind: BenchmarkRunEventKind;
    message: string;
    runId: string;
  }): Promise<BenchmarkRunEvent> {
    const event: BenchmarkRunEvent = BenchmarkRunEventSchema.parse({
      createdAt: nowIso(),
      details: input.details ?? null,
      id: crypto.randomUUID(),
      kind: input.kind,
      message: input.message,
      runId: input.runId,
    });

    await this.db
      .prepare(
        `insert into benchmark_run_events (
          id,
          run_id,
          kind,
          message,
          details,
          created_at
        ) values (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        event.id,
        event.runId,
        event.kind,
        event.message,
        event.details === null ? null : JSON.stringify(event.details),
        event.createdAt
      )
      .run();

    return event;
  }

  async listEvents(runId: string): Promise<BenchmarkRunEvent[]> {
    const result = await this.db
      .prepare(
        `select * from benchmark_run_events
        where run_id = ?
        order by created_at asc`
      )
      .bind(runId)
      .all<BenchmarkRunEventRecord>();

    return result.results.map((row) => this.toEvent(row));
  }

  async putResult(input: {
    agentOutput?: AgentOutput | null;
    artifactPath?: string | null;
    error?: string | null;
    rawOutput?: string | null;
    runId: string;
    score?: BenchmarkRunScore | null;
  }): Promise<BenchmarkRunResult> {
    const result = BenchmarkRunResultSchema.parse({
      agentOutput: input.agentOutput ?? null,
      artifactPath: input.artifactPath ?? null,
      createdAt: nowIso(),
      error: input.error ?? null,
      id: crypto.randomUUID(),
      rawOutput: input.rawOutput ?? null,
      runId: input.runId,
      score: input.score ?? null,
    });

    await this.db
      .prepare(
        `insert into benchmark_run_results (
          id,
          run_id,
          agent_output,
          raw_output,
          score,
          artifact_path,
          error,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        result.id,
        result.runId,
        result.agentOutput ? JSON.stringify(result.agentOutput) : null,
        result.rawOutput,
        result.score ? JSON.stringify(result.score) : null,
        result.artifactPath,
        result.error,
        result.createdAt
      )
      .run();

    return result;
  }

  async getLatestResult(runId: string): Promise<BenchmarkRunResult | null> {
    const row = await this.db
      .prepare(
        `select * from benchmark_run_results
        where run_id = ?
        order by created_at desc
        limit 1`
      )
      .bind(runId)
      .first<BenchmarkRunResultRecord>();

    return row ? this.toResult(row) : null;
  }

  private toRun(row: BenchmarkRunRecord): BenchmarkRunRow {
    return BenchmarkRunRowSchema.parse({
      artifactCommitSha: row.artifact_commit_sha,
      artifactPath: row.artifact_path,
      cleanupCompletedAt: row.cleanup_completed_at,
      cleanupPolicy: row.cleanup_policy,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      difficulty: row.difficulty,
      error: row.error,
      id: row.id,
      modelId: row.model_id,
      modelProvider: row.model_provider,
      score: row.score,
      sessionId: row.session_id,
      status: row.status,
      taskId: row.task_id,
      updatedAt: row.updated_at,
    });
  }

  private toEvent(row: BenchmarkRunEventRecord): BenchmarkRunEvent {
    return BenchmarkRunEventSchema.parse({
      createdAt: row.created_at,
      details: row.details ? JSON.parse(row.details) : null,
      id: row.id,
      kind: row.kind,
      message: row.message,
      runId: row.run_id,
    });
  }

  private toResult(row: BenchmarkRunResultRecord): BenchmarkRunResult {
    return BenchmarkRunResultSchema.parse({
      agentOutput: row.agent_output ? JSON.parse(row.agent_output) : null,
      artifactPath: row.artifact_path,
      createdAt: row.created_at,
      error: row.error,
      id: row.id,
      rawOutput: row.raw_output,
      runId: row.run_id,
      score: row.score ? JSON.parse(row.score) : null,
    });
  }
}
