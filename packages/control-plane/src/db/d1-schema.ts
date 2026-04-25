import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
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
