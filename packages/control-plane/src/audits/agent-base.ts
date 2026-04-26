import {
  type ChatResponseResult,
  type SaveMessagesResult,
  type Session,
  Think,
  type TurnConfig,
  type TurnContext,
} from "@cloudflare/think";
import { selectModel } from "@codebreaker/control-plane/session/model";
import {
  activeBuiltinToolNames,
  createBuiltinTools,
} from "@codebreaker/control-plane/tools/builtins";
import {
  filterToolsByPolicy,
  mergeTieredToolSets,
  type TieredToolSet,
} from "@codebreaker/control-plane/tools/tiers";
import type { Env } from "@codebreaker/control-plane/types";
import { assertNever } from "@codebreaker/shared/lib/utils";
import type { AuditConfig } from "@codebreaker/shared/schemas/audits";
import type { SessionStatus } from "@codebreaker/shared/schemas/primitives";
import {
  type SessionConfig,
  SessionConfigSchema,
} from "@codebreaker/shared/schemas/session";
import { callable } from "agents";
import type { ToolSet } from "ai";

const DEFAULT_AUDIT_SYSTEM_PROMPT =
  "You are an audit agent in the Codebreaker security review pipeline. Use only the tools you are given and stay within your assigned role.";

export type AuditAgentPhase = "investigation" | "validation";

export interface AuditAgentState {
  control?: {
    finalizing?: boolean;
    inputTokens?: number;
    outputTokens?: number;
    /**
     * Coordinator-only marker. Set to "validation" once the coordinator
     * dispatches its first validator; flips which `budgets` slot the
     * `budgetStopReason` checks consult. Investigators/validators leave
     * this unset and always use the audit-level `budgets`.
     */
    phase?: AuditAgentPhase;
    startedAt?: number;
    stopReason?: string;
    toolCalls?: number;
    turns?: number;
  };
  sessionId?: string;
  status: SessionStatus;
}

const FINAL_TURN_PROMPT_SUFFIX = (
  reason: string,
  submissionTools: readonly string[]
) => {
  const submitClause =
    submissionTools.length > 0
      ? `Before stopping, if you have analyzed but not yet submitted findings/decisions you are confident about, you MUST persist them now by calling ${submissionTools.join(", ")}. Submission tools are exempt from token budgets, so they will succeed.`
      : "Do not call any tools.";
  return `Stop now. ${submitClause} Then write a concise final report covering: (1) what you investigated, (2) findings or decisions you already persisted via tools earlier in this turn, and (3) what remains unfinished and why. Stop reason: ${reason}`;
};

const GIT_COMMAND_RE = /\bgit\b/;

/**
 * Shared scaffolding for the three audit Durable Object agents
 * (Coordinator/Investigator/Validator). Each subclass overrides
 * `getRoleSystemPrompt`, `getRoleTools`, and `getRoleActiveToolNames`.
 */
export abstract class BaseAuditAgent extends Think<Env, AuditAgentState> {
  initialState: AuditAgentState = { status: "pending" };

  override async onStart(props?: Record<string, unknown>): Promise<void> {
    await super.onStart(props);
    const config = this.readConfig();
    if (config) {
      this.maxSteps = config.maxSteps;
    }
  }

  override getModel() {
    return selectModel(this.requireConfig(), this.env);
  }

  override getTools(): ToolSet {
    const config = this.readConfig();
    if (!config) {
      return {};
    }

    const audit = config.audit;
    if (!audit) {
      return {};
    }

    const remoteSessionId = audit.sandboxSessionId ?? this.sessionId;
    const builtin = createBuiltinTools({
      env: this.env,
      policy: config.extensionPolicy,
      sessionId: remoteSessionId,
      workspace: this.workspace,
      defaultRemoteTimeoutSeconds: () => this.remainingTimeoutSeconds(config),
      ...(config.sandbox?.profile
        ? { defaultSandboxProfile: config.sandbox.profile }
        : {}),
    });

    const role = this.getRoleTools(audit);
    const merged = mergeTieredToolSets(builtin, role);

    return filterToolsByPolicy(merged, config.extensionPolicy);
  }

  override configureSession(session: Session): Session {
    return session
      .withContext("instructions", {
        provider: {
          get: async () =>
            this.readConfig()?.systemPrompt ?? DEFAULT_AUDIT_SYSTEM_PROMPT,
        },
      })
      .withContext("audit", {
        description: "Audit-role configuration for this Durable Object",
        provider: {
          get: async () => this.auditContext(),
        },
      });
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

    if (!config) {
      return;
    }

    if (this.state.control?.finalizing) {
      return this.finalTurnConfig(
        ctx,
        this.state.control.stopReason ?? "Audit turn finalizing"
      );
    }

    // A stop reason recorded mid-turn (e.g. budget tripped during a step)
    // must force the next turn into finalizing mode so the agent reports
    // back instead of starting a fresh turn under a stale config.
    if (this.state.control?.stopReason) {
      this.setState({
        ...this.state,
        control: {
          ...this.state.control,
          finalizing: true,
          startedAt,
          turns,
        },
        status: "running",
      });
      return this.finalTurnConfig(ctx, this.state.control.stopReason);
    }

    const stopReason =
      this.timeoutStopReason(config, startedAt) ??
      this.budgetStopReason(this.state.control) ??
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
      activeTools: this.activeToolNames(config),
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

  override beforeToolCall(ctx: {
    input?: unknown;
    toolName: string;
  }): { action: "block"; reason: string } | undefined {
    const stopReason =
      this.timeoutStopReason(this.readConfig()) ??
      this.budgetStopReason(this.state.control);
    if (stopReason) {
      this.recordStopReason(stopReason);
      // Submission tools are intentionally exempt from budget/timeout
      // blocks: when an investigator/coordinator/validator runs out of
      // tokens or time, we still want it to be able to persist any
      // findings/decisions it already analyzed before exiting.
      if (!this.isSubmissionTool(ctx.toolName)) {
        return { action: "block", reason: stopReason };
      }
    }

    if (ctx.toolName === "exec_remote") {
      const command = (ctx.input as { command?: unknown } | undefined)?.command;
      if (typeof command === "string" && GIT_COMMAND_RE.test(command)) {
        return {
          action: "block",
          reason:
            "Git commands are blocked. Inspect the existing checkout with ls/grep/sed/head/tail or remote_read.",
        };
      }
    }

    this.recordToolCall();
  }

  override onStepFinish(ctx: {
    usage: {
      inputTokens?: number | undefined;
      outputTokens?: number | undefined;
    };
  }): void {
    const inputTokens = ctx.usage.inputTokens ?? 0;
    const outputTokens = ctx.usage.outputTokens ?? 0;
    this.recordUsage({ inputTokens, outputTokens });
    const reason =
      this.timeoutStopReason(this.readConfig()) ??
      this.budgetStopReason(this.state.control);
    if (reason) {
      this.recordStopReason(reason);
    }
  }

  override onChatResponse(result: ChatResponseResult): void {
    this.setState({
      ...this.state,
      status: this.toSessionStatus(result.status),
    });
    if (this.state.control?.finalizing && result.status !== "aborted") {
      this.setState({
        ...this.state,
        control: { ...this.state.control, finalizing: false },
      });
    }
  }

  override onChatError(error: unknown): unknown {
    this.setState({ ...this.state, status: "failed" });
    return error;
  }

  @callable()
  async init(
    sessionId: string,
    configInput: SessionConfig
  ): Promise<AuditAgentState> {
    await Promise.resolve();
    const config = SessionConfigSchema.parse(configInput);
    if (!config.audit) {
      throw new Error("Audit agent init requires config.audit");
    }
    this.configure<SessionConfig>(config);
    this.maxSteps = config.maxSteps;
    this.setState({
      sessionId,
      status: "idle",
    });
    return this.state;
  }

  @callable()
  async requestFollowUp(content: string): Promise<SaveMessagesResult> {
    const result = await this.saveMessages([
      {
        id: crypto.randomUUID(),
        parts: [{ text: content, type: "text" }],
        role: "user",
      },
    ]);
    this.flushStuckTurnState();
    return result;
  }

  @callable()
  inspectState(): AuditAgentState {
    return this.state;
  }

  @callable()
  inspectConfig(): SessionConfig | null {
    return this.readConfig();
  }

  @callable()
  async stopAndFinalize(
    reason = "Operator requested stop"
  ): Promise<SaveMessagesResult> {
    if (this.state.control?.finalizing) {
      return { requestId: "already-finalizing", status: "skipped" };
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

    await this.waitUntilStable({ timeout: 5000 });

    const submissionTools = this.readConfig()?.audit
      ? this.getRoleSubmissionToolNames(this.requireAudit())
      : [];
    const result = await this.saveMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        parts: [
          {
            text: FINAL_TURN_PROMPT_SUFFIX(reason, submissionTools),
            type: "text",
          },
        ],
        role: "user",
      },
    ]);
    this.flushStuckTurnState();
    return result;
  }

  @callable()
  archive(): AuditAgentState {
    this.setState({ ...this.state, status: "archived" });
    this.resetTurnState();
    return this.state;
  }

  @callable()
  async getMessagesArchive(): Promise<unknown[]> {
    return (await this.getMessages()) as unknown[];
  }

  /**
   * Mirrors the regular session agent's `getMessagesWithTiming` so the
   * dashboard's `GET /sessions/:id/messages` handler can be namespace-agnostic.
   * Audit agents don't track per-tool-run timing, so we just return raw
   * messages.
   */
  @callable()
  async getMessagesWithTiming(): Promise<unknown[]> {
    return (await this.getMessages()) as unknown[];
  }

  @callable()
  async assistantMessageCount(): Promise<number> {
    const messages = (await this.getMessages()) as Array<{ role?: string }>;
    return messages.filter((message) => message.role === "assistant").length;
  }

  protected get sessionId(): string {
    if (!this.state.sessionId) {
      throw new Error("Audit agent has not been initialized with a sessionId");
    }
    return this.state.sessionId;
  }

  protected requireConfig(): SessionConfig {
    const config = this.readConfig();
    if (!config) {
      throw new Error("Audit agent has not been initialized");
    }
    return config;
  }

  protected readConfig(): SessionConfig | null {
    const config = this.getConfig<SessionConfig>();
    return config ? SessionConfigSchema.parse(config) : null;
  }

  protected requireAudit(): AuditConfig {
    const audit = this.requireConfig().audit;
    if (!audit) {
      throw new Error("Audit agent has not been initialized with config.audit");
    }
    return audit;
  }

  /**
   * Tools provided by the role. Subclasses merge their submission and
   * dispatch tools here. Builtin read tools are added by the base class.
   */
  protected abstract getRoleTools(audit: AuditConfig): TieredToolSet;

  /**
   * Names of role-specific tools the model is allowed to call. The base
   * class merges these with builtin read-only tool names that pass the
   * configured policy.
   */
  protected abstract getRoleActiveToolNames(audit: AuditConfig): string[];

  /**
   * Names of role-specific submission/finalization tools that must remain
   * callable even after the agent has exhausted its token/timeout budget.
   * These are surfaced as the only `activeTools` during the final turn and
   * are exempt from `beforeToolCall` budget blocks.
   */
  protected abstract getRoleSubmissionToolNames(audit: AuditConfig): string[];

  protected activeToolNames(config: SessionConfig): string[] {
    const policyToolNames = activeBuiltinToolNames(config.extensionPolicy);
    const roleNames = this.getRoleActiveToolNames(this.requireAudit());
    const merged = [...new Set([...policyToolNames, ...roleNames])];
    return config.activeTools
      ? merged.filter((name) => config.activeTools?.includes(name))
      : merged;
  }

  private auditContext(): string {
    const audit = this.readConfig()?.audit;
    return audit ? JSON.stringify(audit, null, 2) : "No audit config.";
  }

  private finalTurnConfig(ctx: TurnContext, reason: string): TurnConfig {
    const audit = this.readConfig()?.audit;
    const submissionTools = audit ? this.getRoleSubmissionToolNames(audit) : [];
    // Generous step budget so the coordinator can dispatch all remaining
    // planned subagents AND call finalize_audit in a single finalizing turn.
    // Investigators/validators only need 1-2 steps but extra headroom is
    // harmless: the FINAL_TURN_PROMPT_SUFFIX tells the model to stop after
    // a single submit + final report.
    const maxSteps = submissionTools.length > 0 ? 12 : 1;
    return {
      activeTools: submissionTools,
      maxSteps,
      system: `${ctx.system}\n\n${FINAL_TURN_PROMPT_SUFFIX(reason, submissionTools)}`,
    };
  }

  private isSubmissionTool(toolName: string): boolean {
    const audit = this.readConfig()?.audit;
    if (!audit) {
      return false;
    }
    return this.getRoleSubmissionToolNames(audit).includes(toolName);
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
    if (elapsedMs < config.timeoutSeconds * 1000) {
      return null;
    }
    return `Timeout reached (${config.timeoutSeconds}s)`;
  }

  private budgetStopReason(
    control: AuditAgentState["control"] | undefined
  ): string | null {
    if (!control || control.finalizing) {
      return null;
    }
    const budgets = this.activeBudgets();
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
    if (budgets?.maxOutputTokens && outputTokens >= budgets.maxOutputTokens) {
      return `Output token budget reached (${outputTokens}/${budgets.maxOutputTokens})`;
    }
    if (budgets?.maxTotalTokens && totalTokens >= budgets.maxTotalTokens) {
      return `Total token budget reached (${totalTokens}/${budgets.maxTotalTokens})`;
    }
    return null;
  }

  /**
   * Returns the budget config that applies to the current agent phase. For the
   * coordinator after `beginValidationPhase()`, this is the audit-level
   * `validationBudgets` (falling back to the default `budgets` when unset).
   */
  private activeBudgets() {
    const config = this.readConfig();
    if (!config) {
      return;
    }
    if (this.state.control?.phase === "validation") {
      const validationBudgets = config.audit?.validationBudgets;
      if (validationBudgets) {
        return validationBudgets;
      }
    }
    return config.budgets;
  }

  /**
   * Coordinator entry-point invoked from `dispatch_validator`. Idempotent:
   * after the first call, subsequent calls are no-ops. Resets the per-DO
   * usage counters so investigation tokens do not consume the validation
   * budget.
   */
  beginValidationPhase(): void {
    if (this.state.control?.phase === "validation") {
      return;
    }
    const previous = this.state.control ?? {};
    this.setState({
      ...this.state,
      control: {
        finalizing: false,
        inputTokens: 0,
        outputTokens: 0,
        phase: "validation",
        toolCalls: 0,
        ...(previous.startedAt === undefined
          ? {}
          : { startedAt: previous.startedAt }),
        ...(previous.turns === undefined ? {} : { turns: previous.turns }),
      },
    });
  }

  private recordUsage(input: {
    inputTokens: number;
    outputTokens: number;
  }): void {
    // Input tokens are tracked as a high-water-mark of the largest
    // single-step prompt, NOT summed. Each model step within a turn
    // re-sends the entire conversation (system + history + tool
    // results), so summing per-step `inputTokens` across N steps
    // multi-counts the same tokens up to N times — a coordinator doing
    // ~10 dispatch steps in one turn can blow through a 150k cap on
    // its very first user message that way. The high-water-mark
    // matches the actual context-window cost, which is what the
    // budget cap is meant to bound. Output tokens are unique per step
    // and continue to accumulate.
    const control = {
      ...this.state.control,
      inputTokens: Math.max(
        this.state.control?.inputTokens ?? 0,
        input.inputTokens
      ),
      outputTokens:
        (this.state.control?.outputTokens ?? 0) + input.outputTokens,
    };
    this.setState({ ...this.state, control });
  }

  private recordToolCall(): void {
    const control = {
      ...this.state.control,
      toolCalls: (this.state.control?.toolCalls ?? 0) + 1,
    };
    this.setState({ ...this.state, control });
  }

  /**
   * Defensive cleanup invoked after every programmatic `saveMessages` call.
   *
   * `Think._streamResult` skips its `onChatResponse` lifecycle hook when the
   * inference loop yields zero `UIMessage` parts (e.g. a transient provider
   * error before the first token, or a stream that errors out without
   * producing any content). When that happens, the DO state stays at
   * `status: "running"` forever — the coordinator/investigator looks alive
   * to `inspectState()`, the shard never moves off `investigating`, and the
   * audit hangs indefinitely.
   *
   * This forces a terminal status with a synthetic stop reason so the
   * orchestrator can detect and surface the failure.
   */
  private flushStuckTurnState(): void {
    if (this.state.status !== "running") {
      return;
    }
    const reason =
      this.state.control?.stopReason ?? "Model returned no response";
    this.setState({
      ...this.state,
      control: {
        ...this.state.control,
        finalizing: false,
        stopReason: reason,
      },
      status: "failed",
    });
  }

  private recordStopReason(reason: string): void {
    if (this.state.control?.stopReason) {
      return;
    }
    this.setState({
      ...this.state,
      control: { ...this.state.control, stopReason: reason },
    });
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
