import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { Env } from "@codebreaker/control-plane/types";
import {
  MODEL_PROVIDER_CONFIGS,
  type ModelProvider,
} from "@codebreaker/shared/lib/models";
import { assertNever, trimTrailingSlash } from "@codebreaker/shared/lib/utils";
import type { SessionConfig } from "@codebreaker/shared/schemas/session";
import type { LanguageModel } from "ai";
import { createAiGateway } from "ai-gateway-provider";
import { createUnified } from "ai-gateway-provider/providers/unified";

const WORKERS_AI_MODEL_PREFIX = "@cf/";
const WORKERS_AI_GATEWAY_PROVIDER = "workers-ai";

const requireEnv = (
  value: string | undefined,
  name: string,
  providerName: string
): string => {
  if (!value) {
    throw new Error(`${name} is required for ${providerName} sessions`);
  }

  return value;
};

const cloudflareGatewayModelId = (
  provider: ModelProvider,
  modelId: string
): string | undefined => {
  const providerConfig = MODEL_PROVIDER_CONFIGS[provider];

  if (modelId === providerConfig.defaultModelId) {
    return providerConfig.cloudflareGatewayModelId;
  }

  if (modelId.startsWith(WORKERS_AI_MODEL_PREFIX)) {
    return `${WORKERS_AI_GATEWAY_PROVIDER}/${modelId}`;
  }

  if (modelId.includes("/")) {
    return modelId;
  }

  if ("cloudflareGatewayProvider" in providerConfig) {
    return `${providerConfig.cloudflareGatewayProvider}/${modelId}`;
  }
};

const selectCloudflareGatewayModel = (
  config: SessionConfig,
  env: Env,
  providerName: string
): LanguageModel | undefined => {
  const modelId = cloudflareGatewayModelId(
    config.model.provider,
    config.model.id
  );

  if (!(env.CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID && modelId)) {
    return;
  }

  const apiKey = requireEnv(
    env.CLOUDFLARE_AI_GATEWAY_TOKEN,
    "CLOUDFLARE_AI_GATEWAY_TOKEN",
    providerName
  );
  const gateway = createAiGateway({
    accountId: env.CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID,
    apiKey,
    gateway: env.CLOUDFLARE_AI_GATEWAY_ID ?? "default",
  });
  const unified = createUnified({ includeUsage: true });

  return gateway(unified(modelId)) as LanguageModel;
};

export const selectModel = (config: SessionConfig, env: Env): LanguageModel => {
  switch (config.model.provider) {
    case "anthropic": {
      const gatewayModel = selectCloudflareGatewayModel(
        config,
        env,
        "Anthropic"
      );

      if (gatewayModel) {
        return gatewayModel;
      }

      return createAnthropic({
        apiKey: requireEnv(
          env.ANTHROPIC_API_KEY,
          "ANTHROPIC_API_KEY",
          "Anthropic"
        ),
        ...(env.ANTHROPIC_BASE_URL
          ? { baseURL: trimTrailingSlash(env.ANTHROPIC_BASE_URL) }
          : {}),
      })(config.model.id);
    }
    case "gemini": {
      const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY;
      const gatewayModel = selectCloudflareGatewayModel(config, env, "Gemini");

      if (gatewayModel) {
        return gatewayModel;
      }

      return createGoogleGenerativeAI({
        apiKey: requireEnv(apiKey, "GOOGLE_GENERATIVE_AI_API_KEY", "Gemini"),
        ...(env.GEMINI_BASE_URL
          ? { baseURL: trimTrailingSlash(env.GEMINI_BASE_URL) }
          : {}),
      })(config.model.id);
    }
    case "glm": {
      const gatewayModel = selectCloudflareGatewayModel(config, env, "GLM");

      if (gatewayModel) {
        return gatewayModel;
      }

      return createOpenAI({
        apiKey: requireEnv(env.GLM_API_KEY, "GLM_API_KEY", "GLM"),
        baseURL: trimTrailingSlash(
          env.GLM_BASE_URL ?? MODEL_PROVIDER_CONFIGS.glm.defaultBaseUrl
        ),
      }).chat(config.model.id);
    }
    case "kimi": {
      const gatewayModel = selectCloudflareGatewayModel(config, env, "Kimi");

      if (gatewayModel) {
        return gatewayModel;
      }

      return createOpenAI({
        apiKey: requireEnv(env.KIMI_API_KEY, "KIMI_API_KEY", "Kimi"),
        baseURL: trimTrailingSlash(
          env.KIMI_BASE_URL ?? MODEL_PROVIDER_CONFIGS.kimi.defaultBaseUrl
        ),
      }).chat(config.model.id);
    }
    case "openai": {
      const gatewayModel = selectCloudflareGatewayModel(config, env, "OpenAI");

      if (gatewayModel) {
        return gatewayModel;
      }

      return createOpenAI({
        apiKey: requireEnv(env.OPENAI_API_KEY, "OPENAI_API_KEY", "OpenAI"),
        ...(env.OPENAI_BASE_URL
          ? { baseURL: trimTrailingSlash(env.OPENAI_BASE_URL) }
          : {}),
      })(config.model.id);
    }
    default:
      return assertNever(config.model.provider);
  }
};
