import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { BenchmarkRunModel } from "@codebreaker/benchmark-runner/schemas";
import {
  MODEL_PROVIDER_CONFIGS,
  type ModelProvider,
} from "@codebreaker/shared/lib/models";
import { assertNever, trimTrailingSlash } from "@codebreaker/shared/lib/utils";
import type { LanguageModel } from "ai";
import { createAiGateway } from "ai-gateway-provider";
import { createUnified } from "ai-gateway-provider/providers/unified";

export interface DirectModelEnv {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  CLOUDFLARE_AI_GATEWAY_ACCOUNT_ID?: string;
  CLOUDFLARE_AI_GATEWAY_ID?: string;
  CLOUDFLARE_AI_GATEWAY_TOKEN?: string;
  GEMINI_BASE_URL?: string;
  GLM_API_KEY?: string;
  GLM_BASE_URL?: string;
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  KIMI_API_KEY?: string;
  KIMI_BASE_URL?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
}

const WORKERS_AI_MODEL_PREFIX = "@cf/";
const WORKERS_AI_GATEWAY_PROVIDER = "workers-ai";

const requireEnv = (
  value: string | undefined,
  name: string,
  providerName: string
): string => {
  if (!value) {
    throw new Error(`${name} is required for ${providerName} direct runs`);
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
  model: BenchmarkRunModel,
  env: DirectModelEnv,
  providerName: string
): LanguageModel | undefined => {
  const modelId = cloudflareGatewayModelId(model.provider, model.id);

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

export const selectDirectModel = (
  model: BenchmarkRunModel,
  env: DirectModelEnv
): LanguageModel => {
  switch (model.provider) {
    case "anthropic": {
      const gatewayModel = selectCloudflareGatewayModel(
        model,
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
      })(model.id);
    }
    case "gemini": {
      const gatewayModel = selectCloudflareGatewayModel(model, env, "Gemini");

      if (gatewayModel) {
        return gatewayModel;
      }

      return createGoogleGenerativeAI({
        apiKey: requireEnv(
          env.GOOGLE_GENERATIVE_AI_API_KEY,
          "GOOGLE_GENERATIVE_AI_API_KEY",
          "Gemini"
        ),
        ...(env.GEMINI_BASE_URL
          ? { baseURL: trimTrailingSlash(env.GEMINI_BASE_URL) }
          : {}),
      })(model.id);
    }
    case "glm": {
      const gatewayModel = selectCloudflareGatewayModel(model, env, "GLM");

      if (gatewayModel) {
        return gatewayModel;
      }

      return createOpenAI({
        apiKey: requireEnv(env.GLM_API_KEY, "GLM_API_KEY", "GLM"),
        baseURL: trimTrailingSlash(
          env.GLM_BASE_URL ?? MODEL_PROVIDER_CONFIGS.glm.defaultBaseUrl
        ),
      }).chat(model.id);
    }
    case "kimi": {
      const gatewayModel = selectCloudflareGatewayModel(model, env, "Kimi");

      if (gatewayModel) {
        return gatewayModel;
      }

      return createOpenAI({
        apiKey: requireEnv(env.KIMI_API_KEY, "KIMI_API_KEY", "Kimi"),
        baseURL: trimTrailingSlash(
          env.KIMI_BASE_URL ?? MODEL_PROVIDER_CONFIGS.kimi.defaultBaseUrl
        ),
      }).chat(model.id);
    }
    case "openai": {
      const gatewayModel = selectCloudflareGatewayModel(model, env, "OpenAI");

      if (gatewayModel) {
        return gatewayModel;
      }

      return createOpenAI({
        apiKey: requireEnv(env.OPENAI_API_KEY, "OPENAI_API_KEY", "OpenAI"),
        ...(env.OPENAI_BASE_URL
          ? { baseURL: trimTrailingSlash(env.OPENAI_BASE_URL) }
          : {}),
      })(model.id);
    }
    default:
      return assertNever(model.provider);
  }
};
