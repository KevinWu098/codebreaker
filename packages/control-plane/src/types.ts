import type { SessionAgent } from "@codebreaker/control-plane/session/agent";

export interface Env {
  ANTHROPIC_API_KEY?: string;
  DB: D1Database;
  JWT_SECRET: string;
  LOADER: WorkerLoader;
  MODAL_SHIM_SECRET: string;
  MODAL_SHIM_URL: string;
  OPENAI_API_KEY?: string;
  SESSION_AGENT: DurableObjectNamespace<SessionAgent>;
}
