import type {
  AgentOutput,
  BenchmarkCleanupPolicy,
  BenchmarkRunEvent,
  BenchmarkRunEventKind,
  BenchmarkRunLocation,
  BenchmarkRunResult,
  BenchmarkRunRow,
  BenchmarkRunScore,
  BenchmarkRunStatus,
  Difficulty,
  TaskInstance,
} from "@codebreaker/benchmark-runner/schemas";
import {
  BenchmarkRunEventSchema,
  BenchmarkRunLocationSchema,
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
  confidence: number | null;
  correct_locations: number | null;
  created_at: string;
  error: string | null;
  expected_vuln_class: string | null;
  expected_vulnerable: number | null;
  id: string;
  location_score: number | null;
  predicted_vuln_class: string | null;
  predicted_vulnerable: number | null;
  raw_output: string | null;
  run_id: string;
  score: string | null;
  vuln_class_matched: number | null;
  vulnerable_matched: number | null;
}

interface BenchmarkRunLocationRecord {
  created_at: string;
  file: string;
  function_name: string | null;
  id: string;
  matched_ground_truth: number | null;
  result_id: string;
  run_id: string;
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
    task?: TaskInstance | null;
  }): Promise<BenchmarkRunResult> {
    const id = crypto.randomUUID();
    const createdAt = nowIso();
    const extracted = extractResultColumns(input);
    const result = BenchmarkRunResultSchema.parse({
      agentOutput: input.agentOutput ?? null,
      artifactPath:
        input.artifactPath ??
        `d1://benchmark-runs/${input.runId}/results/${id}`,
      confidence: input.agentOutput?.confidence ?? null,
      correctLocations: input.score?.correctLocations ?? null,
      createdAt,
      error: input.error ?? null,
      expectedVulnClass: input.task?.ground_truth.vuln_class ?? null,
      expectedVulnerable:
        input.score?.expectedVulnerable ??
        input.task?.ground_truth.vulnerable ??
        null,
      id,
      locationScore: input.score?.locationScore ?? null,
      predictedVulnClass: input.agentOutput?.vuln_class ?? null,
      predictedVulnerable:
        input.score?.predictedVulnerable ??
        input.agentOutput?.vulnerable ??
        null,
      rawOutput: input.rawOutput ?? null,
      runId: input.runId,
      score: input.score ?? null,
      vulnClassMatched: input.score?.vulnClassMatched ?? null,
      vulnerableMatched: input.score?.vulnerableMatched ?? null,
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
          predicted_vulnerable,
          expected_vulnerable,
          vulnerable_matched,
          predicted_vuln_class,
          expected_vuln_class,
          vuln_class_matched,
          confidence,
          location_score,
          correct_locations,
          created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        result.id,
        result.runId,
        result.agentOutput ? JSON.stringify(result.agentOutput) : null,
        result.rawOutput,
        result.score ? JSON.stringify(result.score) : null,
        result.artifactPath,
        result.error,
        extracted.predictedVulnerable,
        extracted.expectedVulnerable,
        extracted.vulnerableMatched,
        extracted.predictedVulnClass,
        extracted.expectedVulnClass,
        extracted.vulnClassMatched,
        extracted.confidence,
        extracted.locationScore,
        extracted.correctLocations,
        result.createdAt
      )
      .run();

    await this.putLocations({
      agentOutput: input.agentOutput ?? null,
      createdAt,
      resultId: result.id,
      runId: result.runId,
      task: input.task ?? null,
    });

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

  async listLocations(input: {
    resultId?: string;
    runId: string;
  }): Promise<BenchmarkRunLocation[]> {
    const query = input.resultId
      ? this.db
          .prepare(
            `select * from benchmark_run_locations
            where run_id = ? and result_id = ?
            order by created_at asc, file asc`
          )
          .bind(input.runId, input.resultId)
      : this.db
          .prepare(
            `select * from benchmark_run_locations
            where run_id = ?
            order by created_at asc, file asc`
          )
          .bind(input.runId);
    const result = await query.all<BenchmarkRunLocationRecord>();

    return result.results.map((row) => this.toLocation(row));
  }

  private async putLocations(input: {
    agentOutput: AgentOutput | null;
    createdAt: string;
    resultId: string;
    runId: string;
    task: TaskInstance | null;
  }): Promise<void> {
    if (!input.agentOutput) {
      return;
    }

    const expected = new Set(
      input.task?.ground_truth.locations.map(locationKey) ?? []
    );

    for (const location of input.agentOutput.locations) {
      await this.db
        .prepare(
          `insert into benchmark_run_locations (
            id,
            result_id,
            run_id,
            file,
            function_name,
            matched_ground_truth,
            created_at
          ) values (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          input.resultId,
          input.runId,
          location.file,
          location.function,
          input.task ? booleanToDb(expected.has(locationKey(location))) : null,
          input.createdAt
        )
        .run();
    }
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
      confidence: row.confidence,
      correctLocations: row.correct_locations,
      createdAt: row.created_at,
      error: row.error,
      expectedVulnClass: row.expected_vuln_class,
      expectedVulnerable: dbToBoolean(row.expected_vulnerable),
      id: row.id,
      locationScore: row.location_score,
      predictedVulnClass: row.predicted_vuln_class,
      predictedVulnerable: dbToBoolean(row.predicted_vulnerable),
      rawOutput: row.raw_output,
      runId: row.run_id,
      score: row.score ? JSON.parse(row.score) : null,
      vulnClassMatched: dbToBoolean(row.vuln_class_matched),
      vulnerableMatched: dbToBoolean(row.vulnerable_matched),
    });
  }

  private toLocation(row: BenchmarkRunLocationRecord): BenchmarkRunLocation {
    return BenchmarkRunLocationSchema.parse({
      createdAt: row.created_at,
      file: row.file,
      function: row.function_name,
      id: row.id,
      matchedGroundTruth: dbToBoolean(row.matched_ground_truth),
      resultId: row.result_id,
      runId: row.run_id,
    });
  }
}

const extractResultColumns = (input: {
  agentOutput?: AgentOutput | null;
  score?: BenchmarkRunScore | null;
  task?: TaskInstance | null;
}) => ({
  confidence: input.agentOutput?.confidence ?? null,
  correctLocations: input.score?.correctLocations ?? null,
  expectedVulnClass: input.task?.ground_truth.vuln_class ?? null,
  expectedVulnerable: booleanToDb(
    input.score?.expectedVulnerable ??
      input.task?.ground_truth.vulnerable ??
      null
  ),
  locationScore: input.score?.locationScore ?? null,
  predictedVulnClass: input.agentOutput?.vuln_class ?? null,
  predictedVulnerable: booleanToDb(
    input.score?.predictedVulnerable ?? input.agentOutput?.vulnerable ?? null
  ),
  vulnClassMatched: booleanToDb(input.score?.vulnClassMatched ?? null),
  vulnerableMatched: booleanToDb(input.score?.vulnerableMatched ?? null),
});

const locationKey = (location: { file: string; function: string | null }) =>
  `${location.file}\0${location.function ?? ""}`;

const booleanToDb = (value: boolean | null): number | null => {
  if (value === null) {
    return null;
  }

  return value ? 1 : 0;
};

const dbToBoolean = (value: number | null): boolean | null => {
  if (value === null) {
    return null;
  }

  return value === 1;
};
