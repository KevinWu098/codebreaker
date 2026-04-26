import type { ModelProvider } from "@codebreaker/shared/lib/models";
import { nowIso } from "@codebreaker/shared/lib/utils";
import {
  type AuditEvent,
  type AuditEventKind,
  AuditEventSchema,
  type AuditFindingLocation,
  type AuditFindingRow,
  AuditFindingRowSchema,
  type AuditFindingStatus,
  type AuditFindingSubmission,
  type AuditRow,
  AuditRowSchema,
  type AuditSeverity,
  type AuditShardRow,
  AuditShardRowSchema,
  type AuditShardStatus,
  type AuditStatus,
  type AuditValidationSubmission,
  type AuditVulnClass,
  type ShardKind,
} from "@codebreaker/shared/schemas/audits";
import type { SandboxProfileName } from "@codebreaker/shared/schemas/sandbox";

interface AuditRecord {
  cleanup_completed_at: string | null;
  completed_at: string | null;
  coordinator_session_id: string | null;
  created_at: string;
  error: string | null;
  high_confidence_count: number;
  id: string;
  input_tokens: number | null;
  min_confidence: number;
  mirror_repo_full_name: string | null;
  model_id: string;
  model_provider: ModelProvider;
  output_tokens: number | null;
  ref: string | null;
  repo_url: string;
  sandbox_profile: SandboxProfileName | null;
  started_at: string | null;
  status: AuditStatus;
  title: string | null;
  total_candidates: number;
  updated_at: string;
  validated_count: number;
}

interface AuditShardRecord {
  audit_id: string;
  completed_at: string | null;
  created_at: string;
  error: string | null;
  id: string;
  investigator_session_id: string | null;
  kind: ShardKind;
  started_at: string | null;
  status: AuditShardStatus;
  summary: string | null;
  updated_at: string;
}

interface AuditFindingRecord {
  audit_id: string;
  confidence: number;
  created_at: string;
  cwe: string | null;
  description: string;
  evidence: string;
  id: string;
  locations_json: string;
  poc_sketch: string | null;
  references_json: string;
  severity: AuditSeverity;
  shard_id: string | null;
  shard_kind: ShardKind | null;
  status: AuditFindingStatus;
  title: string;
  updated_at: string;
  validation_notes: string | null;
  validator_session_id: string | null;
  vuln_class: AuditVulnClass;
}

interface AuditEventRecord {
  audit_id: string;
  created_at: string;
  details: string | null;
  id: string;
  kind: AuditEventKind;
  message: string;
}

export interface CreateAuditInput {
  id: string;
  minConfidence: number;
  modelId: string;
  modelProvider: ModelProvider;
  ref?: string | null;
  repoUrl: string;
  sandboxProfile?: SandboxProfileName | null;
  title?: string | null;
}

export interface UpdateAuditInput {
  cleanupCompletedAt?: string | null;
  completedAt?: string | null;
  coordinatorSessionId?: string | null;
  error?: string | null;
  highConfidenceCount?: number;
  id: string;
  mirrorRepoFullName?: string | null;
  startedAt?: string | null;
  status?: AuditStatus;
  totalCandidates?: number;
  validatedCount?: number;
}

export interface CreateShardInput {
  auditId: string;
  id: string;
  kind: ShardKind;
}

export interface UpdateShardInput {
  completedAt?: string | null;
  error?: string | null;
  id: string;
  investigatorSessionId?: string | null;
  startedAt?: string | null;
  status?: AuditShardStatus;
  summary?: string | null;
}

const auditSelect = `select
        a.cleanup_completed_at,
        a.completed_at,
        a.coordinator_session_id,
        a.created_at,
        a.error,
        a.high_confidence_count,
        a.id,
        s.input_tokens as input_tokens,
        a.min_confidence,
        a.mirror_repo_full_name,
        a.model_id,
        a.model_provider,
        s.output_tokens as output_tokens,
        a.ref,
        a.repo_url,
        a.sandbox_profile,
        a.started_at,
        a.status,
        a.title,
        a.total_candidates,
        a.updated_at,
        a.validated_count
      from audits a
      left join sessions s on s.id = a.coordinator_session_id`;

export class AuditStore {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async create(input: CreateAuditInput): Promise<AuditRow> {
    const timestamp = nowIso();

    await this.db
      .prepare(
        `insert into audits (
          id,
          repo_url,
          ref,
          status,
          model_provider,
          model_id,
          sandbox_profile,
          min_confidence,
          title,
          created_at,
          updated_at
        ) values (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.repoUrl,
        input.ref ?? null,
        input.modelProvider,
        input.modelId,
        input.sandboxProfile ?? null,
        input.minConfidence,
        input.title ?? null,
        timestamp,
        timestamp
      )
      .run();

    await this.addEvent({
      auditId: input.id,
      kind: "created",
      message: "Audit created",
    });

    const audit = await this.get(input.id);

    if (!audit) {
      throw new Error(`Audit ${input.id} was not written`);
    }

    return audit;
  }

  async get(id: string): Promise<AuditRow | null> {
    const row = await this.db
      .prepare(`${auditSelect} where a.id = ?`)
      .bind(id)
      .first<AuditRecord>();

    return row ? this.toAudit(row) : null;
  }

  async list(options?: {
    limit?: number;
    offset?: number;
    status?: AuditStatus;
  }): Promise<AuditRow[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const query = options?.status
      ? this.db
          .prepare(
            `${auditSelect} where a.status = ? order by a.created_at desc limit ? offset ?`
          )
          .bind(options.status, limit, offset)
      : this.db
          .prepare(`${auditSelect} order by a.created_at desc limit ? offset ?`)
          .bind(limit, offset);
    const result = await query.all<AuditRecord>();

    return result.results.map((row) => this.toAudit(row));
  }

  async count(options?: { status?: AuditStatus }): Promise<number> {
    const row = options?.status
      ? await this.db
          .prepare("select count(1) as c from audits where status = ?")
          .bind(options.status)
          .first<{ c: number }>()
      : await this.db
          .prepare("select count(1) as c from audits")
          .first<{ c: number }>();

    return row ? Number(row.c) : 0;
  }

  async listRunningIds(): Promise<string[]> {
    const result = await this.db
      .prepare(
        "select id from audits where status in ('pending','provisioning','running')"
      )
      .all<{ id: string }>();

    return result.results.map((row) => row.id);
  }

  async update(input: UpdateAuditInput): Promise<AuditRow> {
    const current = await this.get(input.id);

    if (!current) {
      throw new Error(`Audit ${input.id} not found`);
    }

    const next = {
      cleanupCompletedAt:
        input.cleanupCompletedAt === undefined
          ? current.cleanupCompletedAt
          : input.cleanupCompletedAt,
      completedAt:
        input.completedAt === undefined
          ? current.completedAt
          : input.completedAt,
      coordinatorSessionId:
        input.coordinatorSessionId === undefined
          ? current.coordinatorSessionId
          : input.coordinatorSessionId,
      error: input.error === undefined ? current.error : input.error,
      highConfidenceCount:
        input.highConfidenceCount ?? current.highConfidenceCount,
      mirrorRepoFullName:
        input.mirrorRepoFullName === undefined
          ? current.mirrorRepoFullName
          : input.mirrorRepoFullName,
      startedAt:
        input.startedAt === undefined ? current.startedAt : input.startedAt,
      status: input.status ?? current.status,
      totalCandidates: input.totalCandidates ?? current.totalCandidates,
      validatedCount: input.validatedCount ?? current.validatedCount,
    };

    await this.db
      .prepare(
        `update audits set
          status = ?,
          coordinator_session_id = ?,
          mirror_repo_full_name = ?,
          total_candidates = ?,
          validated_count = ?,
          high_confidence_count = ?,
          error = ?,
          started_at = ?,
          completed_at = ?,
          cleanup_completed_at = ?,
          updated_at = ?
        where id = ?`
      )
      .bind(
        next.status,
        next.coordinatorSessionId,
        next.mirrorRepoFullName,
        next.totalCandidates,
        next.validatedCount,
        next.highConfidenceCount,
        next.error,
        next.startedAt,
        next.completedAt,
        next.cleanupCompletedAt,
        nowIso(),
        input.id
      )
      .run();

    const updated = await this.get(input.id);

    if (!updated) {
      throw new Error(`Audit ${input.id} disappeared`);
    }

    return updated;
  }

  async refreshCounts(auditId: string): Promise<AuditRow> {
    const current = await this.get(auditId);

    if (!current) {
      throw new Error(`Audit ${auditId} not found`);
    }

    const total = await this.db
      .prepare("select count(1) as c from audit_findings where audit_id = ?")
      .bind(auditId)
      .first<{ c: number }>();

    const validated = await this.db
      .prepare(
        "select count(1) as c from audit_findings where audit_id = ? and status = 'validated'"
      )
      .bind(auditId)
      .first<{ c: number }>();

    const highConfidence = await this.db
      .prepare(
        "select count(1) as c from audit_findings where audit_id = ? and status = 'validated' and confidence >= ?"
      )
      .bind(auditId, current.minConfidence)
      .first<{ c: number }>();

    return this.update({
      highConfidenceCount: Number(highConfidence?.c ?? 0),
      id: auditId,
      totalCandidates: Number(total?.c ?? 0),
      validatedCount: Number(validated?.c ?? 0),
    });
  }

  async addEvent(input: {
    auditId: string;
    details?: unknown;
    kind: AuditEventKind;
    message: string;
  }): Promise<AuditEvent> {
    const event = AuditEventSchema.parse({
      auditId: input.auditId,
      createdAt: nowIso(),
      details: input.details ?? null,
      id: crypto.randomUUID(),
      kind: input.kind,
      message: input.message,
    });

    await this.db
      .prepare(
        `insert into audit_events (
          id,
          audit_id,
          kind,
          message,
          details,
          created_at
        ) values (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        event.id,
        event.auditId,
        event.kind,
        event.message,
        event.details === null ? null : JSON.stringify(event.details),
        event.createdAt
      )
      .run();

    return event;
  }

  async listEvents(auditId: string): Promise<AuditEvent[]> {
    const result = await this.db
      .prepare(
        "select * from audit_events where audit_id = ? order by created_at asc"
      )
      .bind(auditId)
      .all<AuditEventRecord>();

    return result.results.map((row) =>
      AuditEventSchema.parse({
        auditId: row.audit_id,
        createdAt: row.created_at,
        details: row.details ? JSON.parse(row.details) : null,
        id: row.id,
        kind: row.kind,
        message: row.message,
      })
    );
  }

  // -- shards -----------------------------------------------------------------

  async createShard(input: CreateShardInput): Promise<AuditShardRow> {
    const timestamp = nowIso();

    await this.db
      .prepare(
        `insert into audit_shards (
          id,
          audit_id,
          kind,
          status,
          created_at,
          updated_at
        ) values (?, ?, ?, 'planned', ?, ?)
        on conflict(audit_id, kind) do nothing`
      )
      .bind(input.id, input.auditId, input.kind, timestamp, timestamp)
      .run();

    const shard = await this.getShardByKind(input.auditId, input.kind);

    if (!shard) {
      throw new Error(
        `Shard ${input.kind} for audit ${input.auditId} was not written`
      );
    }

    return shard;
  }

  async getShard(id: string): Promise<AuditShardRow | null> {
    const row = await this.db
      .prepare("select * from audit_shards where id = ?")
      .bind(id)
      .first<AuditShardRecord>();

    return row ? this.toShard(row) : null;
  }

  async getShardByKind(
    auditId: string,
    kind: ShardKind
  ): Promise<AuditShardRow | null> {
    const row = await this.db
      .prepare(
        "select * from audit_shards where audit_id = ? and kind = ? limit 1"
      )
      .bind(auditId, kind)
      .first<AuditShardRecord>();

    return row ? this.toShard(row) : null;
  }

  async listShards(auditId: string): Promise<AuditShardRow[]> {
    const result = await this.db
      .prepare(
        "select * from audit_shards where audit_id = ? order by created_at asc"
      )
      .bind(auditId)
      .all<AuditShardRecord>();

    return result.results.map((row) => this.toShard(row));
  }

  async updateShard(input: UpdateShardInput): Promise<AuditShardRow> {
    const current = await this.getShard(input.id);

    if (!current) {
      throw new Error(`Shard ${input.id} not found`);
    }

    const next = {
      completedAt:
        input.completedAt === undefined
          ? current.completedAt
          : input.completedAt,
      error: input.error === undefined ? current.error : input.error,
      investigatorSessionId:
        input.investigatorSessionId === undefined
          ? current.investigatorSessionId
          : input.investigatorSessionId,
      startedAt:
        input.startedAt === undefined ? current.startedAt : input.startedAt,
      status: input.status ?? current.status,
      summary: input.summary === undefined ? current.summary : input.summary,
    };

    await this.db
      .prepare(
        `update audit_shards set
          status = ?,
          investigator_session_id = ?,
          summary = ?,
          error = ?,
          started_at = ?,
          completed_at = ?,
          updated_at = ?
        where id = ?`
      )
      .bind(
        next.status,
        next.investigatorSessionId,
        next.summary,
        next.error,
        next.startedAt,
        next.completedAt,
        nowIso(),
        input.id
      )
      .run();

    const updated = await this.getShard(input.id);

    if (!updated) {
      throw new Error(`Shard ${input.id} disappeared`);
    }

    return updated;
  }

  // -- findings ---------------------------------------------------------------

  async createFinding(input: {
    auditId: string;
    shardId: string | null;
    submission: AuditFindingSubmission;
  }): Promise<AuditFindingRow> {
    const id = crypto.randomUUID();
    const timestamp = nowIso();

    await this.db
      .prepare(
        `insert into audit_findings (
          id,
          audit_id,
          shard_id,
          status,
          vuln_class,
          severity,
          confidence,
          title,
          description,
          evidence,
          poc_sketch,
          cwe,
          locations_json,
          references_json,
          created_at,
          updated_at
        ) values (?, ?, ?, 'candidate', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        input.auditId,
        input.shardId,
        input.submission.vulnClass,
        input.submission.severity,
        input.submission.confidence,
        input.submission.title,
        input.submission.description,
        input.submission.evidence,
        input.submission.pocSketch ?? null,
        input.submission.cwe ?? null,
        JSON.stringify(input.submission.locations),
        JSON.stringify(input.submission.references ?? []),
        timestamp,
        timestamp
      )
      .run();

    const finding = await this.getFinding(id);

    if (!finding) {
      throw new Error(`Finding ${id} was not written`);
    }

    return finding;
  }

  async getFinding(id: string): Promise<AuditFindingRow | null> {
    const row = await this.db
      .prepare(
        `select f.*, sh.kind as shard_kind
        from audit_findings f
        left join audit_shards sh on sh.id = f.shard_id
        where f.id = ?`
      )
      .bind(id)
      .first<AuditFindingRecord>();

    return row ? this.toFinding(row) : null;
  }

  async listFindings(input: {
    auditId: string;
    limit?: number;
    minConfidence?: number;
    offset?: number;
    shard?: ShardKind;
    status?: AuditFindingStatus;
    vulnClass?: AuditVulnClass;
  }): Promise<AuditFindingRow[]> {
    const conditions: string[] = ["f.audit_id = ?"];
    const params: unknown[] = [input.auditId];

    if (input.status) {
      conditions.push("f.status = ?");
      params.push(input.status);
    }

    if (input.vulnClass) {
      conditions.push("f.vuln_class = ?");
      params.push(input.vulnClass);
    }

    if (input.shard) {
      conditions.push("sh.kind = ?");
      params.push(input.shard);
    }

    if (input.minConfidence !== undefined) {
      conditions.push("f.confidence >= ?");
      params.push(input.minConfidence);
    }

    const limit = input.limit ?? 100;
    const offset = input.offset ?? 0;

    const result = await this.db
      .prepare(
        `select f.*, sh.kind as shard_kind
        from audit_findings f
        left join audit_shards sh on sh.id = f.shard_id
        where ${conditions.join(" and ")}
        order by f.confidence desc, f.created_at desc
        limit ? offset ?`
      )
      .bind(...params, limit, offset)
      .all<AuditFindingRecord>();

    return result.results.map((row) => this.toFinding(row));
  }

  async countFindings(input: {
    auditId: string;
    minConfidence?: number;
    shard?: ShardKind;
    status?: AuditFindingStatus;
    vulnClass?: AuditVulnClass;
  }): Promise<number> {
    const conditions: string[] = ["f.audit_id = ?"];
    const params: unknown[] = [input.auditId];

    if (input.status) {
      conditions.push("f.status = ?");
      params.push(input.status);
    }

    if (input.vulnClass) {
      conditions.push("f.vuln_class = ?");
      params.push(input.vulnClass);
    }

    if (input.shard) {
      conditions.push("sh.kind = ?");
      params.push(input.shard);
    }

    if (input.minConfidence !== undefined) {
      conditions.push("f.confidence >= ?");
      params.push(input.minConfidence);
    }

    const row = await this.db
      .prepare(
        `select count(1) as c from audit_findings f
        left join audit_shards sh on sh.id = f.shard_id
        where ${conditions.join(" and ")}`
      )
      .bind(...params)
      .first<{ c: number }>();

    return row ? Number(row.c) : 0;
  }

  async applyValidation(input: {
    findingId: string;
    submission: AuditValidationSubmission;
    validatorSessionId: string;
  }): Promise<AuditFindingRow> {
    const current = await this.getFinding(input.findingId);

    if (!current) {
      throw new Error(`Finding ${input.findingId} not found`);
    }

    const status: AuditFindingStatus =
      input.submission.verdict === "confirm" ? "validated" : "dismissed";

    const locations: AuditFindingLocation[] =
      input.submission.refinedLocations ?? current.locations;

    const severity = input.submission.refinedSeverity ?? current.severity;

    await this.db
      .prepare(
        `update audit_findings set
          status = ?,
          confidence = ?,
          severity = ?,
          locations_json = ?,
          validation_notes = ?,
          validator_session_id = ?,
          updated_at = ?
        where id = ?`
      )
      .bind(
        status,
        input.submission.confidence,
        severity,
        JSON.stringify(locations),
        input.submission.notes,
        input.validatorSessionId,
        nowIso(),
        input.findingId
      )
      .run();

    const updated = await this.getFinding(input.findingId);

    if (!updated) {
      throw new Error(`Finding ${input.findingId} disappeared`);
    }

    return updated;
  }

  async dismissFinding(
    findingId: string,
    notes: string
  ): Promise<AuditFindingRow> {
    const current = await this.getFinding(findingId);

    if (!current) {
      throw new Error(`Finding ${findingId} not found`);
    }

    await this.db
      .prepare(
        `update audit_findings set
          status = 'dismissed',
          validation_notes = ?,
          updated_at = ?
        where id = ?`
      )
      .bind(notes, nowIso(), findingId)
      .run();

    const updated = await this.getFinding(findingId);

    if (!updated) {
      throw new Error(`Finding ${findingId} disappeared`);
    }

    return updated;
  }

  private toAudit(row: AuditRecord): AuditRow {
    return AuditRowSchema.parse({
      cleanupCompletedAt: row.cleanup_completed_at,
      completedAt: row.completed_at,
      coordinatorSessionId: row.coordinator_session_id,
      createdAt: row.created_at,
      error: row.error,
      highConfidenceCount: row.high_confidence_count,
      id: row.id,
      inputTokens: row.input_tokens,
      minConfidence: row.min_confidence,
      mirrorRepoFullName: row.mirror_repo_full_name,
      modelId: row.model_id,
      modelProvider: row.model_provider,
      outputTokens: row.output_tokens,
      ref: row.ref,
      repoUrl: row.repo_url,
      sandboxProfile: row.sandbox_profile,
      startedAt: row.started_at,
      status: row.status,
      title: row.title,
      totalCandidates: row.total_candidates,
      updatedAt: row.updated_at,
      validatedCount: row.validated_count,
    });
  }

  private toShard(row: AuditShardRecord): AuditShardRow {
    return AuditShardRowSchema.parse({
      auditId: row.audit_id,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      error: row.error,
      id: row.id,
      investigatorSessionId: row.investigator_session_id,
      kind: row.kind,
      startedAt: row.started_at,
      status: row.status,
      summary: row.summary,
      updatedAt: row.updated_at,
    });
  }

  private toFinding(row: AuditFindingRecord): AuditFindingRow {
    return AuditFindingRowSchema.parse({
      auditId: row.audit_id,
      confidence: row.confidence,
      createdAt: row.created_at,
      cwe: row.cwe,
      description: row.description,
      evidence: row.evidence,
      id: row.id,
      locations: JSON.parse(row.locations_json) as AuditFindingLocation[],
      pocSketch: row.poc_sketch,
      references: JSON.parse(row.references_json) as string[],
      severity: row.severity,
      shardId: row.shard_id,
      shardKind: row.shard_kind,
      status: row.status,
      title: row.title,
      updatedAt: row.updated_at,
      validationNotes: row.validation_notes,
      validatorSessionId: row.validator_session_id,
      vulnClass: row.vuln_class,
    });
  }
}
