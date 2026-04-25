import { type Session, Think, type TurnConfig } from "@cloudflare/think";
import { selectModel } from "@codebreaker/control-plane/session/model";
import type { Env } from "@codebreaker/control-plane/types";
import type { SessionStatus } from "@codebreaker/shared/schemas/primitives";
import {
  type SessionConfig,
  SessionConfigSchema,
} from "@codebreaker/shared/schemas/session";
import { callable } from "agents";
import type { ToolSet } from "ai";

export interface SessionAgentState {
  config?: SessionConfig;
  status: SessionStatus;
}

const DEFAULT_SYSTEM_PROMPT =
  "You are Codebreaker, a background security and code workflow agent. Stay within the configured policy and explain tool limitations clearly.";

export class SessionAgent extends Think<Env, SessionAgentState> {
  initialState: SessionAgentState = {
    status: "pending",
  };

  override async onStart(props?: Record<string, unknown>): Promise<void> {
    await super.onStart(props);

    const config = this.readConfig();

    if (config) {
      this.maxSteps = Math.max(1, config.maxTurns);
      this.setState({ config, status: this.state.status });
    }
  }

  override getModel() {
    const config = this.requireConfig();

    return selectModel(config, this.env);
  }

  override getSystemPrompt(): string {
    return this.readConfig()?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  }

  override getTools(): ToolSet {
    return {};
  }

  override configureSession(session: Session): Session {
    return session;
  }

  override beforeTurn(): TurnConfig | undefined {
    const config = this.readConfig();

    if (config?.model.provider === "openai" && config.model.reasoningEffort) {
      return {
        providerOptions: {
          openai: {
            reasoningEffort: config.model.reasoningEffort,
          },
        },
      };
    }
  }

  override onChatError(error: unknown): unknown {
    return error;
  }

  @callable()
  init(configInput: SessionConfig): SessionAgentState {
    const config = SessionConfigSchema.parse(configInput);

    this.configure<SessionConfig>(config);
    this.maxSteps = Math.max(1, config.maxTurns);
    this.setState({ config, status: "idle" });

    return this.state;
  }

  @callable()
  archive(): SessionAgentState {
    this.setState({ ...this.state, status: "archived" });
    this.resetTurnState();

    return this.state;
  }

  @callable()
  inspectConfig(): SessionConfig | null {
    return this.readConfig();
  }

  @callable()
  inspectState(): SessionAgentState {
    return this.state;
  }

  private requireConfig(): SessionConfig {
    const config = this.readConfig();

    if (!config) {
      throw new Error("SessionAgent has not been initialized");
    }

    return config;
  }

  private readConfig(): SessionConfig | null {
    const config = this.getConfig<SessionConfig>();

    return config ? SessionConfigSchema.parse(config) : null;
  }
}
