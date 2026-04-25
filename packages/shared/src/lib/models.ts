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

export interface ModelOption {
  documentationUrl: string;
  id: string;
  label: string;
  provider: ModelProvider;
}

export const MODEL_PROVIDER_CONFIGS = {
  anthropic: {
    cloudflareGatewayModelId: "anthropic/claude-sonnet-4-6",
    cloudflareGatewayProvider: "anthropic",
    defaultModelId: "claude-sonnet-4-6",
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
    defaultModelId: "kimi-k2.6",
    label: "Kimi",
  },
  openai: {
    cloudflareGatewayModelId: "openai/gpt-5-codex",
    cloudflareGatewayProvider: "openai",
    defaultModelId: "gpt-5-codex",
    label: "OpenAI",
  },
} as const satisfies Record<ModelProvider, ModelProviderConfig>;

export const MODEL_OPTIONS_BY_PROVIDER = {
  anthropic: [
    {
      documentationUrl:
        "https://docs.anthropic.com/en/docs/about-claude/models/overview",
      id: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      provider: "anthropic",
    },
    {
      documentationUrl:
        "https://docs.anthropic.com/en/docs/about-claude/models/overview",
      id: "claude-opus-4-7",
      label: "Claude Opus 4.7",
      provider: "anthropic",
    },
  ],
  gemini: [
    {
      documentationUrl: "https://ai.google.dev/gemini-api/docs/models",
      id: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      provider: "gemini",
    },
  ],
  glm: [
    {
      documentationUrl: "https://docs.z.ai/guides/llm/glm-4.6",
      id: "glm-4.6",
      label: "GLM-4.6",
      provider: "glm",
    },
  ],
  kimi: [
    {
      documentationUrl: "https://platform.kimi.ai/docs/models",
      id: "kimi-k2.6",
      label: "Kimi K2.6",
      provider: "kimi",
    },
  ],
  openai: [
    {
      documentationUrl:
        "https://developers.openai.com/api/docs/models/gpt-5-codex",
      id: "gpt-5-codex",
      label: "GPT-5-Codex",
      provider: "openai",
    },
    {
      documentationUrl: "https://developers.openai.com/api/docs/models/gpt-5",
      id: "gpt-5",
      label: "GPT-5",
      provider: "openai",
    },
  ],
} as const satisfies Record<ModelProvider, readonly ModelOption[]>;

export const MODEL_OPTIONS: readonly ModelOption[] = MODEL_PROVIDERS.flatMap(
  (provider): readonly ModelOption[] => MODEL_OPTIONS_BY_PROVIDER[provider]
);

export const DEFAULT_MODEL_IDS = Object.fromEntries(
  MODEL_PROVIDERS.map((provider) => [
    provider,
    MODEL_PROVIDER_CONFIGS[provider].defaultModelId,
  ])
) as Record<ModelProvider, string>;
