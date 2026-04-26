import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  agentRole: text("agent_role"),
  artifactLatestCommitSha: text("artifact_latest_commit_sha"),
  artifactPath: text("artifact_path"),
  artifactStatus: text("artifact_status"),
  artifactWorkingBranch: text("artifact_working_branch"),
  benchmarkId: text("benchmark_id"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  id: text("id").primaryKey(),
  inputTokens: integer("input_tokens").notNull().default(0),
  modelId: text("model_id").notNull(),
  modelProvider: text("model_provider").notNull(),
  outputTokens: integer("output_tokens").notNull().default(0),
  repoName: text("repo_name"),
  repoOwner: text("repo_owner"),
  runCommand: text("run_command"),
  runRepoName: text("run_repo_name"),
  runRepoRemote: text("run_repo_remote"),
  status: text("status").notNull(),
  targetRepoName: text("target_repo_name"),
  targetRepoRemote: text("target_repo_remote"),
  title: text("title"),
  turnCount: integer("turn_count").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
  vulnerableEvidencePath: text("vulnerable_evidence_path"),
  patchedEvidencePath: text("patched_evidence_path"),
});

export const processedEvents = sqliteTable(
  "processed_events",
  {
    createdAt: text("created_at").notNull(),
    eventId: text("event_id").notNull(),
    kind: text("kind").notNull(),
    sessionId: text("session_id").notNull(),
  },
  (table) => [
    uniqueIndex("processed_events_unique_event").on(
      table.sessionId,
      table.kind,
      table.eventId
    ),
  ]
);

export const benchmarkRuns = sqliteTable("benchmark_runs", {
  artifactCommitSha: text("artifact_commit_sha"),
  artifactPath: text("artifact_path"),
  cleanupCompletedAt: text("cleanup_completed_at"),
  cleanupPolicy: text("cleanup_policy").notNull(),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  difficulty: text("difficulty").notNull(),
  error: text("error"),
  id: text("id").primaryKey(),
  modelId: text("model_id").notNull(),
  modelProvider: text("model_provider").notNull(),
  score: integer("score"),
  sessionId: text("session_id"),
  status: text("status").notNull(),
  taskId: text("task_id").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const benchmarkRunEvents = sqliteTable("benchmark_run_events", {
  createdAt: text("created_at").notNull(),
  details: text("details"),
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  runId: text("run_id").notNull(),
});

export const benchmarkRunResults = sqliteTable("benchmark_run_results", {
  agentOutput: text("agent_output"),
  artifactPath: text("artifact_path"),
  createdAt: text("created_at").notNull(),
  error: text("error"),
  id: text("id").primaryKey(),
  rawOutput: text("raw_output"),
  runId: text("run_id").notNull(),
  score: text("score"),
});

export const cveFollowups = sqliteTable("cve_followups", {
  autoFired: integer("auto_fired").notNull(),
  cancellationReason: text("cancellation_reason"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  deepwikiContext: text("deepwiki_context"),
  ghsaId: text("ghsa_id").notNull(),
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  status: text("status").notNull(),
  taskId: text("task_id").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const cveFollowupStages = sqliteTable("cve_followup_stages", {
  attempts: integer("attempts").notNull().default(0),
  branch: text("branch"),
  createdAt: text("created_at").notNull(),
  devinSessionId: text("devin_session_id"),
  devinUrl: text("devin_url"),
  followupId: text("followup_id").notNull(),
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  lastError: text("last_error"),
  prUrl: text("pr_url"),
  status: text("status").notNull(),
  updatedAt: text("updated_at").notNull(),
  validationResultId: text("validation_result_id"),
});

export const cveFollowupValidations = sqliteTable("cve_followup_validations", {
  createdAt: text("created_at").notNull(),
  exitCode: integer("exit_code"),
  id: text("id").primaryKey(),
  manifestJson: text("manifest_json"),
  markerSeen: integer("marker_seen"),
  observationalFingerprintMatched: integer("observational_fingerprint_matched"),
  passed: integer("passed").notNull(),
  stageId: text("stage_id").notNull(),
  stderrExcerpt: text("stderr_excerpt"),
  stdoutExcerpt: text("stdout_excerpt"),
  tier: text("tier"),
});

export const cveFollowupEvents = sqliteTable("cve_followup_events", {
  createdAt: text("created_at").notNull(),
  details: text("details"),
  followupId: text("followup_id").notNull(),
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
});

export const audits = sqliteTable("audits", {
  cleanupCompletedAt: text("cleanup_completed_at"),
  completedAt: text("completed_at"),
  coordinatorSessionId: text("coordinator_session_id"),
  createdAt: text("created_at").notNull(),
  error: text("error"),
  highConfidenceCount: integer("high_confidence_count").notNull().default(0),
  id: text("id").primaryKey(),
  minConfidence: integer("min_confidence").notNull().default(0),
  mirrorRepoFullName: text("mirror_repo_full_name"),
  modelId: text("model_id").notNull(),
  modelProvider: text("model_provider").notNull(),
  ref: text("ref"),
  repoUrl: text("repo_url").notNull(),
  sandboxProfile: text("sandbox_profile"),
  startedAt: text("started_at"),
  status: text("status").notNull(),
  title: text("title"),
  totalCandidates: integer("total_candidates").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
  validatedCount: integer("validated_count").notNull().default(0),
});

export const auditShards = sqliteTable(
  "audit_shards",
  {
    auditId: text("audit_id").notNull(),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull(),
    error: text("error"),
    id: text("id").primaryKey(),
    investigatorSessionId: text("investigator_session_id"),
    kind: text("kind").notNull(),
    startedAt: text("started_at"),
    status: text("status").notNull(),
    summary: text("summary"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("audit_shards_audit_kind").on(table.auditId, table.kind),
  ]
);

export const auditFindings = sqliteTable("audit_findings", {
  auditId: text("audit_id").notNull(),
  confidence: integer("confidence").notNull(),
  createdAt: text("created_at").notNull(),
  cwe: text("cwe"),
  description: text("description").notNull(),
  evidence: text("evidence").notNull(),
  id: text("id").primaryKey(),
  locationsJson: text("locations_json").notNull(),
  pocSketch: text("poc_sketch"),
  referencesJson: text("references_json").notNull().default("[]"),
  severity: text("severity").notNull(),
  shardId: text("shard_id"),
  status: text("status").notNull(),
  title: text("title").notNull(),
  updatedAt: text("updated_at").notNull(),
  validationNotes: text("validation_notes"),
  validatorSessionId: text("validator_session_id"),
  vulnClass: text("vuln_class").notNull(),
});

export const auditEvents = sqliteTable("audit_events", {
  auditId: text("audit_id").notNull(),
  createdAt: text("created_at").notNull(),
  details: text("details"),
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
});
