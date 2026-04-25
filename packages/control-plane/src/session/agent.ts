import {
  type ChatRecoveryContext,
  type ChatRecoveryOptions,
  type ChatResponseResult,
  type MessageConcurrency,
  type SaveMessagesResult,
  type Session,
  type StepContext,
  Think,
  type TurnConfig,
} from "@cloudflare/think";
import { BenchmarkRunStore } from "@codebreaker/control-plane/db/benchmark-runs";
import { SessionIndexStore } from "@codebreaker/control-plane/db/session-index";
import { selectModel } from "@codebreaker/control-plane/session/model";
import {
  activeBuiltinToolNames,
  createBuiltinTools,
} from "@codebreaker/control-plane/tools/builtins";
import type { Env } from "@codebreaker/control-plane/types";
import { assertNever } from "@codebreaker/shared/lib/utils";
import {
  type BenchmarkArtifactState,
  BenchmarkArtifactStateSchema,
} from "@codebreaker/shared/schemas/artifacts";
import type { SessionStatus } from "@codebreaker/shared/schemas/primitives";
import {
  type SessionConfig,
  SessionConfigSchema,
} from "@codebreaker/shared/schemas/session";
import { callable } from "agents";
import { createCompactFunction } from "agents/experimental/memory/utils";
import { generateText, type ToolSet } from "ai";

export interface SessionAgentState {
  artifact?: BenchmarkArtifactState;
  sessionId?: string;
  status: SessionStatus;
}

const DEFAULT_SYSTEM_PROMPT =
  "You are Codebreaker, a background security and code workflow agent. Stay within the configured policy and explain tool limitations clearly.";
const BENCHMARK_SESSION_PREFIX = "bench-";

export class SessionAgent extends Think<Env, SessionAgentState> {
  initialState: SessionAgentState = {
    status: "pending",
  };
  override messageConcurrency: MessageConcurrency = "queue";

  override async onStart(props?: Record<string, unknown>): Promise<void> {
    await super.onStart(props);

    const config = this.readConfig();

    if (config) {
      this.maxSteps = config.maxSteps;
    }

    const artifact = this.readPropsArtifact(props);

    if (artifact && !this.state.artifact) {
      this.setState({
        ...this.state,
        artifact,
      });
    }
  }

  override getModel() {
    const config = this.requireConfig();

    return selectModel(config, this.env);
  }

  override getTools(): ToolSet {
    const config = this.readConfig();

    if (!config) {
      return {};
    }

    return createBuiltinTools({
      env: this.env,
      policy: config.extensionPolicy,
      sessionId: this.sessionId,
      workspace: this.workspace,
    }).tools;
  }

  override configureSession(session: Session): Session {
    const config = this.readConfig();
    const configuredSession = session
      .withContext("instructions", {
        provider: {
          get: async () =>
            this.readConfig()?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
        },
      })
      .withContext("memory", {
        description: "Durable operator-visible session memory",
        maxTokens: 2000,
      })
      .withContext("benchmark_artifact", {
        description: "Current benchmark artifact Git repository state",
        provider: {
          get: async () =>
            this.state.artifact
              ? JSON.stringify(this.state.artifact, null, 2)
              : "No benchmark artifact repository is configured.",
        },
      });

    if (!config?.compaction.enabled) {
      return configuredSession;
    }

    return configuredSession
      .onCompaction(
        createCompactFunction({
          tailTokenBudget: this.compactionTailTokenBudget(config),
          minTailMessages: config.compaction.preserveRecentMessages,
          summarize: async (prompt) => {
            const result = await generateText({
              model: this.getModel(),
              prompt,
            });

            return result.text;
          },
        })
      )
      .compactAfter(config.compaction.summarizeAtTokens);
  }

  override beforeTurn(): TurnConfig | undefined {
    const config = this.readConfig();

    this.setState({
      ...this.state,
      status: "running",
    });
    const eventId = `running:${crypto.randomUUID()}`;
    this.ctx.waitUntil(
      Promise.all([
        this.sessionIndex.setStatus({
          eventId,
          id: this.sessionId,
          status: "running",
        }),
        this.sessionIndex.incrementTurn({
          eventId,
          id: this.sessionId,
        }),
      ]).then(() => undefined)
    );

    if (!config) {
      return;
    }

    const turnConfig: TurnConfig = {
      activeTools: activeBuiltinToolNames(config.extensionPolicy),
    };

    if (config.model.provider === "openai" && config.model.reasoningEffort) {
      turnConfig.providerOptions = {
        openai: {
          reasoningEffort: config.model.reasoningEffort,
        },
      };
    }

    return turnConfig;
  }

  override onStepFinish(ctx: StepContext): void {
    this.ctx.waitUntil(
      this.sessionIndex.addTokenUsage({
        eventId: `${ctx.response.id}:${ctx.stepNumber}`,
        id: this.sessionId,
        inputTokens: ctx.usage.inputTokens ?? 0,
        outputTokens: ctx.usage.outputTokens ?? 0,
      })
    );
  }

  override onChatResponse(result: ChatResponseResult): void {
    const status = this.toSessionStatus(result.status);

    this.setState({
      ...this.state,
      status,
    });
    this.ctx.waitUntil(
      this.sessionIndex.setStatus({
        eventId: `${result.status}:${result.requestId}`,
        id: this.sessionId,
        status,
      })
    );
    if (status === "failed") {
      this.ctx.waitUntil(
        this.markBenchmarkRunFailed("Agent chat response failed")
      );
    }
  }

  override onChatError(error: unknown): unknown {
    const message = error instanceof Error ? error.message : String(error);

    this.setState({
      ...this.state,
      status: "failed",
    });
    this.ctx.waitUntil(
      Promise.all([
        this.sessionIndex.setStatus({
          eventId: `chat-error:${crypto.randomUUID()}`,
          id: this.sessionId,
          status: "failed",
        }),
        this.markBenchmarkRunFailed(message),
      ]).then(() => undefined)
    );

    return error;
  }

  override onChatRecovery(
    ctx: ChatRecoveryContext
  ): Promise<ChatRecoveryOptions> {
    const config = this.readConfig();
    const timeoutMs = (config?.timeoutSeconds ?? 300) * 1000;
    const replayWindowMs = Math.min(timeoutMs, 5 * 60 * 1000);
    const shouldContinue = Date.now() - ctx.createdAt <= replayWindowMs;
    const status = shouldContinue ? "running" : "failed";

    this.setState({
      ...this.state,
      status,
    });

    this.ctx.waitUntil(
      Promise.all([
        this.sessionIndex.setStatus({
          eventId: `recovery:${ctx.requestId}`,
          id: this.sessionId,
          status,
        }),
        shouldContinue
          ? Promise.resolve()
          : this.markBenchmarkRunFailed("Agent turn recovery window expired"),
      ]).then(() => undefined)
    );

    return Promise.resolve({
      continue: shouldContinue,
      persist: true,
    });
  }

  @callable()
  init(
    sessionId: string,
    configInput: SessionConfig,
    artifactInput?: BenchmarkArtifactState
  ): SessionAgentState {
    const config = SessionConfigSchema.parse(configInput);
    const artifact = artifactInput
      ? BenchmarkArtifactStateSchema.parse(artifactInput)
      : undefined;

    this.configure<SessionConfig>(config);
    this.maxSteps = config.maxSteps;
    this.setState({
      ...(artifact ? { artifact } : {}),
      sessionId,
      status: "idle",
    });

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

  @callable()
  setArtifactState(artifactInput: BenchmarkArtifactState): SessionAgentState {
    const artifact = BenchmarkArtifactStateSchema.parse(artifactInput);

    this.setState({
      ...this.state,
      artifact,
    });
    this.ctx.waitUntil(
      this.sessionIndex.setArtifactState({
        artifact,
        eventId: `artifact:${crypto.randomUUID()}`,
        id: this.sessionId,
      })
    );

    return this.state;
  }

  @callable()
  requestFollowUp(content: string): Promise<SaveMessagesResult> {
    return this.saveMessages([
      {
        id: crypto.randomUUID(),
        parts: [{ text: content, type: "text" }],
        role: "user",
      },
    ]);
  }

  @callable()
  continuePreviousTurn(
    body?: Record<string, unknown>
  ): Promise<SaveMessagesResult> {
    return this.continueLastTurn(body);
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

  private readPropsArtifact(
    props: Record<string, unknown> | undefined
  ): BenchmarkArtifactState | null {
    const artifact = props?.artifact;

    return artifact ? BenchmarkArtifactStateSchema.parse(artifact) : null;
  }

  private get sessionId(): string {
    if (!this.state.sessionId) {
      throw new Error(
        "SessionAgent has not been initialized with a session ID"
      );
    }

    return this.state.sessionId;
  }

  private get sessionIndex(): SessionIndexStore {
    return new SessionIndexStore(this.env.DB);
  }

  private getBenchmarkRunId(): string | null {
    if (!this.state.sessionId?.startsWith(BENCHMARK_SESSION_PREFIX)) {
      return null;
    }

    return this.state.sessionId.slice(BENCHMARK_SESSION_PREFIX.length) || null;
  }

  private async markBenchmarkRunFailed(message: string): Promise<void> {
    const runId = this.getBenchmarkRunId();

    if (!runId) {
      return;
    }

    const runs = new BenchmarkRunStore(this.env.DB);
    const run = await runs.get(runId);

    const canFailRun = run?.status === "pending" || run?.status === "running";

    if (!canFailRun) {
      return;
    }

    await runs.update({
      completedAt: new Date().toISOString(),
      error: message,
      id: runId,
      status: "failed",
    });
    await runs.addEvent({
      kind: "failed",
      message,
      runId,
    });
  }

  private compactionTailTokenBudget(config: SessionConfig): number {
    return Math.max(
      2000,
      config.compaction.maxContextTokens - config.compaction.summarizeAtTokens
    );
  }

  private toSessionStatus(status: ChatResponseResult["status"]): SessionStatus {
    switch (status) {
      case "aborted":
        return "idle";
      case "completed":
        return "idle";
      case "error":
        return "failed";
      default:
        return assertNever(status);
    }
  }
}
