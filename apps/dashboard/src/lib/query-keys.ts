import type { Connection } from "@/lib/connection";

const scope = (connection: Connection) =>
  [connection.baseUrl, connection.token] as const;

export const qk = {
  admin: {
    health: (connection: Connection) =>
      ["admin", "health", ...scope(connection)] as const,
    sandboxes: (connection: Connection) =>
      ["admin", "sandboxes", ...scope(connection)] as const,
  },
  benchmarkRun: (connection: Connection, id: string) =>
    ["benchmark-run", id, ...scope(connection)] as const,
  cveFollowup: (connection: Connection, runId: string) =>
    ["cve-followup", runId, ...scope(connection)] as const,
  cveFollowupsList: (connection: Connection) =>
    ["cve-followups", ...scope(connection)] as const,
  benchmarkRuns: (connection: Connection) =>
    ["benchmark-runs", ...scope(connection)] as const,
  benchmarkTasks: (connection: Connection) =>
    ["benchmark-tasks", ...scope(connection)] as const,
  health: (connection: Connection) => ["health", ...scope(connection)] as const,
  session: {
    artifacts: (connection: Connection, id: string) =>
      ["session", id, "artifacts", ...scope(connection)] as const,
    config: (connection: Connection, id: string) =>
      ["session", id, "config", ...scope(connection)] as const,
    detail: (connection: Connection, id: string) =>
      ["session", id, "detail", ...scope(connection)] as const,
    messages: (connection: Connection, id: string) =>
      ["session", id, "messages", ...scope(connection)] as const,
    sandbox: (connection: Connection, id: string) =>
      ["session", id, "sandbox", ...scope(connection)] as const,
    state: (connection: Connection, id: string) =>
      ["session", id, "state", ...scope(connection)] as const,
  },
  sessions: (connection: Connection) =>
    ["sessions", ...scope(connection)] as const,
};
