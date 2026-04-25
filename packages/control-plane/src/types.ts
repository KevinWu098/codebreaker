import type { SessionAgent } from "@codebreaker/control-plane/session/agent";

export interface Env {
  ALLOWED_ORIGINS?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID?: string;
  CLOUDFLARE_AI_GATEWAY_ID?: string;
  CLOUDFLARE_AI_GATEWAY_TOKEN?: string;
  DB: D1Database;
  FORGEJO_BASE_URL?: string;
  FORGEJO_ORG?: string;
  FORGEJO_OWNER?: string;
  FORGEJO_TOKEN?: string;
  FORGEJO_USERNAME?: string;
  GEMINI_BASE_URL?: string;
  GIT_TREE_PROVIDER?: "forgejo";
  GLM_API_KEY?: string;
  GLM_BASE_URL?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  JWT_SECRET: string;
  KIMI_API_KEY?: string;
  KIMI_BASE_URL?: string;
  LOADER: WorkerLoader;
  MODAL_SHIM_SECRET: string;
  MODAL_SHIM_URL: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  SESSION_AGENT: DurableObjectNamespace<SessionAgent>;
}
