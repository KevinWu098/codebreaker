export const MODEL_PROVIDERS = [
  "openai",
  "anthropic",
  "gemini",
  "kimi",
  "glm",
] as const;

export type ModelProvider = (typeof MODEL_PROVIDERS)[number];

const TOKENS_PER_MILLION = 1_000_000;

interface ModelProviderConfig {
  cloudflareGatewayModelId?: string;
  cloudflareGatewayProvider?: string;
  defaultBaseUrl?: string;
  defaultModelId: string;
  label: string;
}

export interface ModelTokenPricing {
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  sourceUrl: string;
}

export interface ModelOption {
  documentationUrl: string;
  id: string;
  label: string;
  pricing: ModelTokenPricing;
  provider: ModelProvider;
}

export interface TokenUsageCost {
  inputUsd: number;
  outputUsd: number;
  pricing: ModelTokenPricing;
  totalUsd: number;
}

export interface TokenUsageCostInput {
  inputTokens: number;
  modelId: string;
  modelProvider: ModelProvider;
  outputTokens: number;
}

export interface CloudflareAiGatewayCustomCost {
  per_token_in: number;
  per_token_out: number;
}

export const CLOUDFLARE_AI_GATEWAY_COSTS_URL =
  "https://developers.cloudflare.com/ai-gateway/observability/costs";

export const CLOUDFLARE_AI_GATEWAY_CUSTOM_COSTS_URL =
  "https://developers.cloudflare.com/ai-gateway/configuration/custom-costs";

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
      pricing: {
        inputUsdPerMillionTokens: 3,
        outputUsdPerMillionTokens: 15,
        sourceUrl: "https://docs.anthropic.com/en/docs/about-claude/pricing",
      },
      provider: "anthropic",
    },
    {
      documentationUrl:
        "https://docs.anthropic.com/en/docs/about-claude/models/overview",
      id: "claude-opus-4-7",
      label: "Claude Opus 4.7",
      pricing: {
        inputUsdPerMillionTokens: 5,
        outputUsdPerMillionTokens: 25,
        sourceUrl: "https://docs.anthropic.com/en/docs/about-claude/pricing",
      },
      provider: "anthropic",
    },
  ],
  gemini: [
    {
      documentationUrl: "https://ai.google.dev/gemini-api/docs/models",
      id: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      pricing: {
        inputUsdPerMillionTokens: 1.25,
        outputUsdPerMillionTokens: 10,
        sourceUrl: "https://ai.google.dev/gemini-api/docs/pricing",
      },
      provider: "gemini",
    },
  ],
  glm: [
    {
      documentationUrl: "https://docs.z.ai/guides/llm/glm-4.6",
      id: "glm-4.6",
      label: "GLM-4.6",
      pricing: {
        inputUsdPerMillionTokens: 0.6,
        outputUsdPerMillionTokens: 2.2,
        sourceUrl: "https://docs.z.ai/guides/overview/pricing",
      },
      provider: "glm",
    },
  ],
  kimi: [
    {
      documentationUrl: "https://platform.kimi.ai/docs/models",
      id: "kimi-k2.6",
      label: "Kimi K2.6",
      pricing: {
        inputUsdPerMillionTokens: 0.95,
        outputUsdPerMillionTokens: 4,
        sourceUrl: "https://platform.kimi.ai/docs/pricing/chat-k26",
      },
      provider: "kimi",
    },
  ],
  openai: [
    {
      documentationUrl:
        "https://developers.openai.com/api/docs/models/gpt-5-codex",
      id: "gpt-5-codex",
      label: "GPT-5-Codex",
      pricing: {
        inputUsdPerMillionTokens: 1.25,
        outputUsdPerMillionTokens: 10,
        sourceUrl: "https://platform.openai.com/docs/pricing",
      },
      provider: "openai",
    },
    {
      documentationUrl: "https://developers.openai.com/api/docs/models/gpt-5",
      id: "gpt-5",
      label: "GPT-5",
      pricing: {
        inputUsdPerMillionTokens: 1.25,
        outputUsdPerMillionTokens: 10,
        sourceUrl: "https://platform.openai.com/docs/pricing",
      },
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

export const MODEL_PRICING_BY_PROVIDER = Object.fromEntries(
  MODEL_PROVIDERS.map((provider) => [
    provider,
    Object.fromEntries(
      MODEL_OPTIONS_BY_PROVIDER[provider].map((option) => [
        option.id,
        option.pricing,
      ])
    ),
  ])
) as Record<ModelProvider, Record<string, ModelTokenPricing>>;

export const getModelTokenPricing = (
  provider: ModelProvider,
  modelId: string
): ModelTokenPricing | undefined =>
  MODEL_PRICING_BY_PROVIDER[provider][modelId];

export const toCloudflareAiGatewayCustomCost = (
  pricing: ModelTokenPricing
): CloudflareAiGatewayCustomCost => ({
  per_token_in: pricing.inputUsdPerMillionTokens / TOKENS_PER_MILLION,
  per_token_out: pricing.outputUsdPerMillionTokens / TOKENS_PER_MILLION,
});

export const estimateTokenUsageCost = ({
  inputTokens,
  modelId,
  modelProvider,
  outputTokens,
}: TokenUsageCostInput): TokenUsageCost | undefined => {
  const pricing = getModelTokenPricing(modelProvider, modelId);

  if (!pricing) {
    return;
  }

  const inputUsd =
    (inputTokens / TOKENS_PER_MILLION) * pricing.inputUsdPerMillionTokens;
  const outputUsd =
    (outputTokens / TOKENS_PER_MILLION) * pricing.outputUsdPerMillionTokens;

  return {
    inputUsd,
    outputUsd,
    pricing,
    totalUsd: inputUsd + outputUsd,
  };
};
