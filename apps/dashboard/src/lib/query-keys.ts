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
  health: (connection: Connection) => ["health", ...scope(connection)] as const,
  session: {
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
