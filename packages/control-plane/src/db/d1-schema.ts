import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  id: text("id").primaryKey(),
  inputTokens: integer("input_tokens").notNull().default(0),
  modelId: text("model_id").notNull(),
  modelProvider: text("model_provider").notNull(),
  outputTokens: integer("output_tokens").notNull().default(0),
  repoName: text("repo_name"),
  repoOwner: text("repo_owner"),
  status: text("status").notNull(),
  title: text("title"),
  turnCount: integer("turn_count").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
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
