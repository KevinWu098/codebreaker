import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { Env } from "@codebreaker/control-plane/types";
import { assertNever } from "@codebreaker/shared/lib/utils";
import type { SessionConfig } from "@codebreaker/shared/schemas/session";
import type { LanguageModel } from "ai";

export const selectModel = (config: SessionConfig, env: Env): LanguageModel => {
  switch (config.model.provider) {
    case "anthropic": {
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is required for Anthropic sessions");
      }

      return createAnthropic({ apiKey: env.ANTHROPIC_API_KEY })(
        config.model.id
      );
    }
    case "openai": {
      if (!env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is required for OpenAI sessions");
      }

      return createOpenAI({ apiKey: env.OPENAI_API_KEY })(config.model.id);
    }
    default:
      return assertNever(config.model.provider);
  }
};
