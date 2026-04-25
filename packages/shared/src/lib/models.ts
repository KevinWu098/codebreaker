export const MODEL_PROVIDERS = [
  "openai",
  "anthropic",
  "gemini",
  "kimi",
  "glm",
] as const;

export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

interface ModelProviderConfig {
  cloudflareGatewayModelId?: string;
  cloudflareGatewayProvider?: string;
  defaultBaseUrl?: string;
  defaultModelId: string;
  label: string;
}

export const MODEL_PROVIDER_CONFIGS = {
  anthropic: {
    cloudflareGatewayModelId: "anthropic/claude-3-5-sonnet-latest",
    cloudflareGatewayProvider: "anthropic",
    defaultModelId: "claude-3-5-sonnet-latest",
    label: "Anthropic",
  },
  gemini: {
    cloudflareGatewayModelId: "google-ai-studio/gemini-2.5-pro",
    cloudflareGatewayProvider: "google-ai-studio",
    defaultModelId: "gemini-2.5-pro",
    label: "Gemini",
  },
  glm: {
    cloudflareGatewayModelId: "workers-ai/@cf/zai-org/glm-4.7-flash",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModelId: "glm-4.6",
    label: "GLM",
  },
  kimi: {
    cloudflareGatewayModelId: "workers-ai/@cf/moonshotai/kimi-k2.6",
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    defaultModelId: "kimi-k2-0711-preview",
    label: "Kimi",
  },
  openai: {
    cloudflareGatewayModelId: "openai/gpt-5-codex",
    cloudflareGatewayProvider: "openai",
    defaultModelId: "gpt-5-codex",
    label: "OpenAI",
  },
} as const satisfies Record<ModelProvider, ModelProviderConfig>;

export const DEFAULT_MODEL_IDS = Object.fromEntries(
  MODEL_PROVIDERS.map((provider) => [
    provider,
    MODEL_PROVIDER_CONFIGS[provider].defaultModelId,
  ])
) as Record<ModelProvider, string>;
