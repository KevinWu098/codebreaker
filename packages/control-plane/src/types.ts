import type { SessionAgent } from "@codebreaker/control-plane/session/agent";

export interface Env {
  ALLOWED_ORIGINS?: string;
  ANTHROPIC_API_KEY?: string;
  DB: D1Database;
  FORGEJO_BASE_URL?: string;
  FORGEJO_ORG?: string;
  FORGEJO_OWNER?: string;
  FORGEJO_TOKEN?: string;
  FORGEJO_USERNAME?: string;
  GIT_TREE_PROVIDER?: "forgejo";
  JWT_SECRET: string;
  LOADER: WorkerLoader;
  MODAL_SHIM_SECRET: string;
  MODAL_SHIM_URL: string;
  OPENAI_API_KEY?: string;
  SESSION_AGENT: DurableObjectNamespace<SessionAgent>;
}
