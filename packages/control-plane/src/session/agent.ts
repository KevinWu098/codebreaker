import {
  type ChatRecoveryContext,
  type ChatRecoveryOptions,
  type ChatResponseResult,
  type MessageConcurrency,
  type SaveMessagesResult,
  type Session,
  type StepContext,
  Think,
  type ToolCallContext,
  type ToolCallDecision,
  type TurnConfig,
  type TurnContext,
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
  control?: {
    finalizing?: boolean;
    inputTokens?: number;
    outputTokens?: number;
    startedAt?: number;
    stopReason?: string;
    toolCalls?: number;
    turns?: number;
  };
  sessionId?: string;
  status: SessionStatus;
}

const DEFAULT_SYSTEM_PROMPT =
  "You are Codebreaker, a background security and code workflow agent. Stay within the configured policy and explain tool limitations clearly.";
const BENCHMARK_SESSION_PREFIX = "bench-";
const FINALIZE_PROMPT = (reason: string) =>
  `Stop now. Do not call tools. Based only on the transcript and tool results so far, give your best final answer. If the original task required a specific output format, obey that format exactly. Stop reason: ${reason}`;

// Detects shell commands that invoke `git clone`, including chained or piped
// forms like `cd /workspace && git clone ...` or `git -C foo clone ...`.
// The leading boundary covers start-of-line, whitespace, and the common
// shell separators (`|`, `;`, `&`, `(`).
const GIT_CLONE_RE = /(?:^|[\s|;&(])git(?:\s+-C\s+\S+)?\s+clone\b/;

export class SessionAgent extends Think<Env, SessionAgentState> {
  initialState: SessionAgentState = {
    status: "pending",
  };
  override messageConcurrency: MessageConcurrency = "queue";
  private sessionReadyPromise: Promise<void> | undefined;

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
      defaultRemoteTimeoutSeconds: () => this.remainingTimeoutSeconds(config),
      ...(config.sandbox?.profile
        ? { defaultSandboxProfile: config.sandbox.profile }
        : {}),
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

  override beforeTurn(ctx: TurnContext): TurnConfig | undefined {
    const config = this.readConfig();
    const startedAt = this.state.control?.startedAt ?? Date.now();
    const turns = (this.state.control?.turns ?? 0) + 1;

    this.setState({
      ...this.state,
      control: {
        ...this.state.control,
        startedAt,
        turns,
      },
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

    if (this.state.control?.finalizing) {
      return this.finalTurnConfig(
        ctx,
        this.state.control.stopReason ?? "Run is finalizing"
      );
    }

    if (this.state.control?.stopReason) {
      return this.finalTurnConfig(ctx, this.state.control.stopReason);
    }

    const stopReason =
      this.timeoutStopReason(config, startedAt) ??
      (turns > config.maxTurns
        ? `Turn budget reached (${turns - 1}/${config.maxTurns})`
        : null);

    if (stopReason) {
      this.setState({
        ...this.state,
        control: {
          ...this.state.control,
          finalizing: true,
          startedAt,
          stopReason,
          turns,
        },
        status: "running",
      });

      return this.finalTurnConfig(ctx, stopReason);
    }

    const turnConfig: TurnConfig = {
      activeTools: activeBuiltinToolNames(config.extensionPolicy),
      maxSteps: config.maxSteps,
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
    const inputTokens = ctx.usage.inputTokens ?? 0;
    const outputTokens = ctx.usage.outputTokens ?? 0;

    const control = this.recordUsage({
      inputTokens,
      outputTokens,
    });
    const stopReason =
      this.timeoutStopReason(this.readConfig()) ??
      this.budgetStopReason(control);

    if (stopReason) {
      this.recordStopReason(stopReason);
    }

    this.ctx.waitUntil(
      this.sessionIndex.addTokenUsage({
        eventId: `${ctx.response.id}:${ctx.stepNumber}`,
        id: this.sessionId,
        inputTokens,
        outputTokens,
      })
    );
  }

  override beforeToolCall(ctx: ToolCallContext): ToolCallDecision | undefined {
    const stopReason =
      this.timeoutStopReason(this.readConfig()) ??
      this.budgetStopReason(this.state.control);

    if (stopReason) {
      this.recordStopReason(stopReason);

      return {
        action: "block",
        reason: `${stopReason}. Stop calling tools and return the best valid final answer using the evidence already present in the transcript.`,
      };
    }

    const cloneBlock = this.detectRedundantClone(ctx);

    if (cloneBlock) {
      return cloneBlock;
    }

    this.recordToolCall(ctx.toolName);
  }

  private detectRedundantClone(
    ctx: ToolCallContext
  ): ToolCallDecision | undefined {
    if (ctx.toolName !== "exec_remote") {
      return;
    }

    const artifact = this.state.artifact;

    if (!artifact) {
      return;
    }

    const command = (ctx.input as { command?: unknown } | undefined)?.command;

    if (typeof command !== "string" || !GIT_CLONE_RE.test(command)) {
      return;
    }

    const repoPath = `/workspace/${artifact.runRepoName}`;

    return {
      action: "block",
      reason: `Refusing to run \`git clone\`: the benchmark target is already checked out at ${repoPath}. Use exec_remote against that path (e.g. \`git -C ${repoPath} log -1\`, \`grep -RIn ... ${repoPath}\`) or remote_read instead. Do not re-clone or download the repository.`,
    };
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
    if (this.state.control?.finalizing && result.status !== "aborted") {
      this.setState({
        ...this.state,
        control: {
          ...this.state.control,
          finalizing: false,
        },
      });
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
    const shouldContinue = Date.now() - ctx.createdAt <= timeoutMs;
    const nextState: SessionAgentState = shouldContinue
      ? {
          ...this.state,
          status: "running",
        }
      : {
          ...this.state,
          control: {
            ...this.state.control,
            finalizing: true,
            stopReason: "Agent turn recovery window expired",
          },
          status: "running",
        };

    this.setState(nextState);

    this.ctx.waitUntil(
      Promise.all([
        this.sessionIndex.setStatus({
          eventId: `recovery:${ctx.requestId}`,
          id: this.sessionId,
          status: "running",
        }),
        shouldContinue
          ? Promise.resolve()
          : this.finalizeAfterStable("Agent turn recovery window expired"),
      ]).then(() => undefined)
    );

    return Promise.resolve({
      continue: shouldContinue,
      persist: true,
    });
  }

  @callable()
  async init(
    sessionId: string,
    configInput: SessionConfig,
    artifactInput?: BenchmarkArtifactState
  ): Promise<SessionAgentState> {
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
    await this.ensureSessionReady();

    return this.state;
  }

  @callable()
  archive(): SessionAgentState {
    this.setState({ ...this.state, status: "archived" });
    this.resetTurnState();

    return this.state;
  }

  @callable()
  async stopAndFinalize(
    reason = "Operator requested stop"
  ): Promise<SaveMessagesResult> {
    await this.ensureSessionReady();

    if (this.state.control?.finalizing) {
      return {
        requestId: "already-finalizing",
        status: "skipped",
      };
    }

    this.setState({
      ...this.state,
      control: {
        ...this.state.control,
        finalizing: true,
        stopReason: reason,
      },
      status: "running",
    });
    this.resetTurnState();

    return await this.finalizeAfterStable(reason);
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
  async requestFollowUp(content: string): Promise<SaveMessagesResult> {
    await this.ensureSessionReady();

    return this.saveMessages([
      {
        id: crypto.randomUUID(),
        parts: [{ text: content, type: "text" }],
        role: "user",
      },
    ]);
  }

  @callable()
  async continuePreviousTurn(
    body?: Record<string, unknown>
  ): Promise<SaveMessagesResult> {
    await this.ensureSessionReady();

    return await this.continueLastTurn(body);
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

  private async ensureSessionReady(): Promise<void> {
    if (this.session) {
      return;
    }

    this.sessionReadyPromise ??= this.onStart().finally(() => {
      this.sessionReadyPromise = undefined;
    });

    await this.sessionReadyPromise;
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

  private async finalizeAfterStable(
    reason: string
  ): Promise<SaveMessagesResult> {
    await this.waitUntilStable({ timeout: 5000 });

    return this.saveMessages((currentMessages) => [
      ...currentMessages,
      {
        id: crypto.randomUUID(),
        parts: [{ text: FINALIZE_PROMPT(reason), type: "text" }],
        role: "user",
      },
    ]);
  }

  private recordUsage(input: {
    inputTokens: number;
    outputTokens: number;
    toolCalls?: number;
  }): NonNullable<SessionAgentState["control"]> {
    const control = {
      ...this.state.control,
      inputTokens: (this.state.control?.inputTokens ?? 0) + input.inputTokens,
      outputTokens:
        (this.state.control?.outputTokens ?? 0) + input.outputTokens,
      toolCalls: (this.state.control?.toolCalls ?? 0) + (input.toolCalls ?? 0),
    };

    this.setState({
      ...this.state,
      control,
    });

    return control;
  }

  private recordToolCall(
    _toolName: string
  ): NonNullable<SessionAgentState["control"]> {
    const control = {
      ...this.state.control,
      toolCalls: (this.state.control?.toolCalls ?? 0) + 1,
    };

    this.setState({
      ...this.state,
      control,
    });

    return control;
  }

  private recordStopReason(reason: string): void {
    if (this.state.control?.stopReason) {
      return;
    }

    this.setState({
      ...this.state,
      control: {
        ...this.state.control,
        stopReason: reason,
      },
    });
  }

  private budgetStopReason(
    control: SessionAgentState["control"] | undefined
  ): string | null {
    if (!control || control.finalizing) {
      return null;
    }

    const budgets = this.readConfig()?.budgets;
    const inputTokens = control.inputTokens ?? 0;
    const outputTokens = control.outputTokens ?? 0;
    const totalTokens = inputTokens + outputTokens;
    const toolCalls = control.toolCalls ?? 0;

    if (budgets?.maxToolCalls && toolCalls >= budgets.maxToolCalls) {
      return `Tool call budget reached (${toolCalls}/${budgets.maxToolCalls})`;
    }

    if (budgets?.maxInputTokens && inputTokens >= budgets.maxInputTokens) {
      return `Input token budget reached (${inputTokens}/${budgets.maxInputTokens})`;
    }

    if (budgets?.maxTotalTokens && totalTokens >= budgets.maxTotalTokens) {
      return `Total token budget reached (${totalTokens}/${budgets.maxTotalTokens})`;
    }

    return null;
  }

  private finalTurnConfig(ctx: TurnContext, reason: string): TurnConfig {
    return {
      activeTools: [],
      maxSteps: 1,
      system: `${ctx.system}\n\nYou are finalizing a stopped run. Do not call tools. Answer from the transcript only. Stop reason: ${reason}`,
    };
  }

  private remainingTimeoutSeconds(config: SessionConfig): number | undefined {
    const startedAt = this.state.control?.startedAt;

    if (!startedAt) {
      return config.timeoutSeconds;
    }

    const remainingMs = startedAt + config.timeoutSeconds * 1000 - Date.now();

    return Math.max(1, Math.ceil(remainingMs / 1000));
  }

  private timeoutStopReason(
    config: SessionConfig | null,
    startedAt = this.state.control?.startedAt
  ): string | null {
    if (!(config && startedAt)) {
      return null;
    }

    const elapsedMs = Date.now() - startedAt;
    const timeoutMs = config.timeoutSeconds * 1000;

    if (elapsedMs < timeoutMs) {
      return null;
    }

    return `Timeout reached (${config.timeoutSeconds}s)`;
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
