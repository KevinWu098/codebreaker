import { nowIso } from "@codebreaker/shared/lib/utils";
import {
  type SessionRow,
  SessionRowSchema,
} from "@codebreaker/shared/schemas/api";
import type { SessionStatus } from "@codebreaker/shared/schemas/primitives";
import {
  type SessionConfig,
  SessionConfigSchema,
} from "@codebreaker/shared/schemas/session";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 25;

interface SessionRowRecord {
  completed_at: string | null;
  created_at: string;
  id: string;
  input_tokens: number;
  model_id: string;
  model_provider: string;
  output_tokens: number;
  repo_name: string | null;
  repo_owner: string | null;
  status: SessionStatus;
  title: string | null;
  turn_count: number;
  updated_at: string;
}

export interface UpsertSessionInput {
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

    await this.withRetry(async () => {
      await this.db
        .prepare(
          `insert into sessions (
            id,
            status,
            title,
            model_provider,
            model_id,
            repo_owner,
            repo_name,
            input_tokens,
            output_tokens,
            turn_count,
            created_at,
            updated_at,
            completed_at
          ) values (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, null)
          on conflict(id) do update set
            status = excluded.status,
            title = excluded.title,
            model_provider = excluded.model_provider,
            model_id = excluded.model_id,
            repo_owner = excluded.repo_owner,
            repo_name = excluded.repo_name,
            updated_at = excluded.updated_at`
        )
        .bind(
          input.id,
          input.status ?? "pending",
          config.title ?? null,
          config.model.provider,
          config.model.id,
          config.repo?.owner ?? null,
          config.repo?.name ?? null,
          timestamp,
          timestamp
        )
        .run();
    });

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

    const result = await this.withRetry(() => query.all<SessionRowRecord>());

    return result.results.map((row) => this.toSessionRow(row));
  }

  async get(id: string): Promise<SessionRow | null> {
    const row = await this.withRetry(() =>
      this.db
        .prepare("select * from sessions where id = ?")
        .bind(id)
        .first<SessionRowRecord>()
    );

    return row ? this.toSessionRow(row) : null;
  }

  async setStatus(input: {
    completedAt?: string | null;
    eventId?: string;
    id: string;
    status: SessionStatus;
  }): Promise<void> {
    const shouldApply = await this.recordEventOnce({
      eventId: input.eventId ?? `${input.status}:${nowIso()}`,
      kind: "status",
      sessionId: input.id,
    });

    if (!shouldApply) {
      return;
    }

    await this.withRetry(() =>
      this.db
        .prepare(
          `update sessions
          set status = ?, completed_at = coalesce(?, completed_at), updated_at = ?
          where id = ?`
        )
        .bind(input.status, input.completedAt ?? null, nowIso(), input.id)
        .run()
    );
  }

  async addTokenUsage(input: {
    eventId: string;
    id: string;
    inputTokens: number;
    outputTokens: number;
  }): Promise<void> {
    const shouldApply = await this.recordEventOnce({
      eventId: input.eventId,
      kind: "token_usage",
      sessionId: input.id,
    });

    if (!shouldApply) {
      return;
    }

    await this.withRetry(() =>
      this.db
        .prepare(
          `update sessions
          set input_tokens = input_tokens + ?,
            output_tokens = output_tokens + ?,
            updated_at = ?
          where id = ?`
        )
        .bind(input.inputTokens, input.outputTokens, nowIso(), input.id)
        .run()
    );
  }

  async incrementTurn(input: { eventId: string; id: string }): Promise<void> {
    const shouldApply = await this.recordEventOnce({
      eventId: input.eventId,
      kind: "turn",
      sessionId: input.id,
    });

    if (!shouldApply) {
      return;
    }

    await this.withRetry(() =>
      this.db
        .prepare(
          `update sessions
          set turn_count = turn_count + 1, updated_at = ?
          where id = ?`
        )
        .bind(nowIso(), input.id)
        .run()
    );
  }

  private async recordEventOnce(input: {
    eventId: string;
    kind: string;
    sessionId: string;
  }): Promise<boolean> {
    const result = await this.withRetry(() =>
      this.db
        .prepare(
          `insert into processed_events (session_id, kind, event_id, created_at)
          values (?, ?, ?, ?)
          on conflict(session_id, kind, event_id) do nothing
          returning event_id`
        )
        .bind(input.sessionId, input.kind, input.eventId, nowIso())
        .first<{ event_id: string }>()
    );

    return Boolean(result);
  }

  private toSessionRow(row: SessionRowRecord): SessionRow {
    return SessionRowSchema.parse({
      completedAt: row.completed_at,
      createdAt: row.created_at,
      id: row.id,
      inputTokens: row.input_tokens,
      modelId: row.model_id,
      modelProvider: row.model_provider,
      outputTokens: row.output_tokens,
      repoName: row.repo_name,
      repoOwner: row.repo_owner,
      status: row.status,
      title: row.title,
      turnCount: row.turn_count,
      updatedAt: row.updated_at,
    });
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt < MAX_RETRIES - 1) {
          await new Promise((resolve) => {
            setTimeout(resolve, RETRY_BASE_MS * 2 ** attempt);
          });
        }
      }
    }

    throw lastError;
  }
}
