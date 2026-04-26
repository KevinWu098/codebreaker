import { nowIso } from "@codebreaker/shared/lib/utils";
import {
  type SessionAgentRole,
  type SessionRow,
  SessionRowSchema,
} from "@codebreaker/shared/schemas/api";
import type { BenchmarkArtifactState } from "@codebreaker/shared/schemas/artifacts";
import type { SessionStatus } from "@codebreaker/shared/schemas/primitives";
import {
  type SessionConfig,
  SessionConfigSchema,
} from "@codebreaker/shared/schemas/session";

interface SessionRowRecord {
  agent_role: SessionAgentRole | null;
  artifact_latest_commit_sha: string | null;
  artifact_path: string | null;
  artifact_status: string | null;
  artifact_working_branch: string | null;
  benchmark_id: string | null;
  completed_at: string | null;
  created_at: string;
  id: string;
  input_tokens: number;
  model_id: string;
  model_provider: string;
  output_tokens: number;
  patched_evidence_path: string | null;
  repo_name: string | null;
  repo_owner: string | null;
  run_command: string | null;
  run_repo_name: string | null;
  run_repo_remote: string | null;
  status: SessionStatus;
  target_repo_name: string | null;
  target_repo_remote: string | null;
  title: string | null;
  turn_count: number;
  updated_at: string;
  vulnerable_evidence_path: string | null;
}

export interface UpsertSessionInput {
  agentRole?: SessionAgentRole;
  config: SessionConfig;
  id: string;
  status?: SessionStatus;
}

export class SessionIndexStore {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async upsert(input: UpsertSessionInput): Promise<SessionRow> {
    const config = SessionConfigSchema.parse(input.config);
    const timestamp = nowIso();

    await this.db
      .prepare(
        `insert into sessions (
          id,
          status,
          agent_role,
          title,
          model_provider,
          model_id,
          repo_owner,
          repo_name,
          benchmark_id,
          input_tokens,
          output_tokens,
          turn_count,
          created_at,
          updated_at,
          completed_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, null)
        on conflict(id) do update set
          status = excluded.status,
          agent_role = excluded.agent_role,
          title = excluded.title,
          model_provider = excluded.model_provider,
          model_id = excluded.model_id,
          repo_owner = excluded.repo_owner,
          repo_name = excluded.repo_name,
          benchmark_id = excluded.benchmark_id,
          updated_at = excluded.updated_at`
      )
      .bind(
        input.id,
        input.status ?? "pending",
        input.agentRole ?? "session",
        config.title ?? null,
        config.model.provider,
        config.model.id,
        config.repo?.owner ?? null,
        config.repo?.name ?? null,
        config.benchmark?.target.benchmarkId ?? null,
        timestamp,
        timestamp
      )
      .run();

    const session = await this.get(input.id);

    if (!session) {
      throw new Error(`Session ${input.id} was not written to D1`);
    }

    return session;
  }

  async list(options: {
    limit: number;
    offset: number;
    status?: SessionStatus | undefined;
  }): Promise<SessionRow[]> {
    const query = options.status
      ? this.db
          .prepare(
            `select * from sessions
            where status = ?
            order by created_at desc
            limit ? offset ?`
          )
          .bind(options.status, options.limit, options.offset)
      : this.db
          .prepare(
            `select * from sessions
            order by created_at desc
            limit ? offset ?`
          )
          .bind(options.limit, options.offset);

    const result = await query.all<SessionRowRecord>();

    return result.results.map((row) => this.toSessionRow(row));
  }

  async count(options: { status?: SessionStatus } = {}): Promise<number> {
    const query = options.status
      ? this.db
          .prepare("select count(1) as c from sessions where status = ?")
          .bind(options.status)
      : this.db.prepare("select count(1) as c from sessions");
    const row = await query.first<{ c: number }>();

    return row ? Number(row.c) : 0;
  }

  async get(id: string): Promise<SessionRow | null> {
    const row = await this.db
      .prepare("select * from sessions where id = ?")
      .bind(id)
      .first<SessionRowRecord>();

    return row ? this.toSessionRow(row) : null;
  }

  async setStatus(input: {
    completedAt?: string | null;
    eventId?: string;
    id: string;
    status: SessionStatus;
  }): Promise<void> {
    const eventId = input.eventId ?? `${input.status}:${nowIso()}`;
    const timestamp = nowIso();

    await this.db.batch([
      this.recordEventStatement({
        eventId,
        kind: "status",
        sessionId: input.id,
        timestamp,
      }),
      this.db
        .prepare(
          `update sessions
          set status = ?, completed_at = coalesce(?, completed_at), updated_at = ?
          where id = ?
            and exists (
              select 1 from processed_events
              where session_id = ? and kind = 'status' and event_id = ? and created_at = ?
            )`
        )
        .bind(
          input.status,
          input.completedAt ?? null,
          timestamp,
          input.id,
          input.id,
          eventId,
          timestamp
        ),
    ]);
  }

  async addTokenUsage(input: {
    eventId: string;
    id: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<void> {
    const timestamp = nowIso();

    await this.db.batch([
      this.recordEventStatement({
        eventId: input.eventId,
        kind: "token_usage",
        sessionId: input.id,
        timestamp,
      }),
      this.db
        .prepare(
          `update sessions
          set input_tokens = input_tokens + ?,
            output_tokens = output_tokens + ?,
            updated_at = ?
          where id = ?
            and exists (
              select 1 from processed_events
              where session_id = ? and kind = 'token_usage' and event_id = ? and created_at = ?
            )`
        )
        .bind(
          input.inputTokens,
          input.outputTokens,
          timestamp,
          input.id,
          input.id,
          input.eventId,
          timestamp
        ),
    ]);
  }

  async setArtifactState(input: {
    artifact: BenchmarkArtifactState;
    eventId?: string;
    id: string;
  }): Promise<void> {
    const eventId = input.eventId ?? `artifact:${nowIso()}`;
    const timestamp = nowIso();

    await this.db.batch([
      this.recordEventStatement({
        eventId,
        kind: "artifact",
        sessionId: input.id,
        timestamp,
      }),
      this.db
        .prepare(
          `update sessions
          set benchmark_id = ?,
            target_repo_name = ?,
            target_repo_remote = ?,
            run_repo_name = ?,
            run_repo_remote = ?,
            artifact_working_branch = ?,
            artifact_latest_commit_sha = ?,
            artifact_path = ?,
            run_command = ?,
            vulnerable_evidence_path = ?,
            patched_evidence_path = ?,
            artifact_status = ?,
            updated_at = ?
          where id = ?
            and exists (
              select 1 from processed_events
              where session_id = ? and kind = 'artifact' and event_id = ? and created_at = ?
            )`
        )
        .bind(
          input.artifact.benchmarkId,
          input.artifact.targetRepoName,
          input.artifact.targetRepoRemote,
          input.artifact.runRepoName,
          input.artifact.runRepoRemote,
          input.artifact.workingBranch,
          input.artifact.latestCommitSha ?? null,
          input.artifact.artifactPath ?? null,
          input.artifact.runCommand ?? null,
          input.artifact.vulnerableEvidencePath ?? null,
          input.artifact.patchedEvidencePath ?? null,
          input.artifact.status,
          timestamp,
          input.id,
          input.id,
          eventId,
          timestamp
        ),
    ]);
  }

  async incrementTurn(input: { eventId: string; id: string }): Promise<void> {
    const timestamp = nowIso();

    await this.db.batch([
      this.recordEventStatement({
        eventId: input.eventId,
        kind: "turn",
        sessionId: input.id,
        timestamp,
      }),
      this.db
        .prepare(
          `update sessions
          set turn_count = turn_count + 1, updated_at = ?
          where id = ?
            and exists (
              select 1 from processed_events
              where session_id = ? and kind = 'turn' and event_id = ? and created_at = ?
            )`
        )
        .bind(timestamp, input.id, input.id, input.eventId, timestamp),
    ]);
  }

  private recordEventStatement(input: {
    eventId: string;
    kind: string;
    sessionId: string;
    timestamp: string;
  }): D1PreparedStatement {
    return this.db
      .prepare(
        `insert into processed_events (session_id, kind, event_id, created_at)
        values (?, ?, ?, ?)
        on conflict(session_id, kind, event_id) do nothing`
      )
      .bind(input.sessionId, input.kind, input.eventId, input.timestamp);
  }

  private toSessionRow(row: SessionRowRecord): SessionRow {
    return SessionRowSchema.parse({
      agentRole: row.agent_role ?? "session",
      artifactLatestCommitSha: row.artifact_latest_commit_sha,
      artifactPath: row.artifact_path,
      artifactStatus: row.artifact_status,
      artifactWorkingBranch: row.artifact_working_branch,
      benchmarkId: row.benchmark_id,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      id: row.id,
      inputTokens: row.input_tokens,
      modelId: row.model_id,
      modelProvider: row.model_provider,
      outputTokens: row.output_tokens,
      repoName: row.repo_name,
      repoOwner: row.repo_owner,
      runCommand: row.run_command,
      runRepoName: row.run_repo_name,
      runRepoRemote: row.run_repo_remote,
      status: row.status,
      targetRepoName: row.target_repo_name,
      targetRepoRemote: row.target_repo_remote,
      title: row.title,
      turnCount: row.turn_count,
      updatedAt: row.updated_at,
      patchedEvidencePath: row.patched_evidence_path,
      vulnerableEvidencePath: row.vulnerable_evidence_path,
    });
  }
}
