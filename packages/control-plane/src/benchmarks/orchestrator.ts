import type { SaveMessagesResult } from "@cloudflare/think";
import { parseAgentOutputs } from "@codebreaker/benchmark-runner/agent-core/output";
import type {
  AgentOutput,
  BenchmarkRunRow,
  CreateBenchmarkRunRequest,
} from "@codebreaker/benchmark-runner/schemas";
import {
  DEFAULT_BENCHMARK_MAX_STEPS,
  DEFAULT_BENCHMARK_MAX_TOOL_CALLS,
  DEFAULT_BENCHMARK_MAX_TURNS,
  DEFAULT_BENCHMARK_TIMEOUT_SECONDS,
  getBenchmarkTokenLimits,
  scoreBestCandidate,
} from "@codebreaker/benchmark-runner/schemas";
import {
  benchmarkInitialPrompt,
  toBenchmarkSessionConfig,
} from "@codebreaker/benchmark-runner/session-config";
import { createGitTreeStore } from "@codebreaker/control-plane/artifacts/repository";
import { BenchmarkDatasetService } from "@codebreaker/control-plane/benchmarks/dataset";
import { CveFollowupOrchestrator } from "@codebreaker/control-plane/cve-followup/orchestrator";
import { BenchmarkRunStore } from "@codebreaker/control-plane/db/benchmark-runs";
import { SessionIndexStore } from "@codebreaker/control-plane/db/session-index";
import { withDORetry } from "@codebreaker/control-plane/do/retry";
import { ModalExecutor } from "@codebreaker/control-plane/sandbox/modal";
import type { Env } from "@codebreaker/control-plane/types";
import type {
  BenchmarkArtifactState,
  BenchmarkConfig,
} from "@codebreaker/shared/schemas/artifacts";
import type { SandboxProfileName } from "@codebreaker/shared/schemas/sandbox";
import { getAgentByName } from "agents";

interface BenchmarkSubmissionAgent {
  getMessages(): Promise<unknown>;
  popPendingBenchmarkOutput(): Promise<AgentOutput | null>;
  requestFollowUp(content: string): Promise<SaveMessagesResult>;
}

const AGENT_TURN_COMPLETION_GRACE_SECONDS = 30;
// Hard ceiling, in seconds, on how long any benchmark run is allowed to stay
// in the `running` state before the watchdog finalizes it. Sized to comfortably
// exceed the largest configured `timeoutSeconds + AGENT_TURN_COMPLETION_GRACE`.
const WATCHDOG_MAX_RUNNING_SECONDS = 900;
const BENCHMARK_SUBMIT_FOLLOWUP_PROMPT =
  "The exploration turn is over. You must call `submit_benchmark_result` once with your strongest single final result object (schema-enforced). Do not write JSON in an assistant message. Do not use any other tools. Base your answer on the prior transcript and tool results.";
const BENCHMARK_SUBMIT_TURN_TIMEOUT_SECONDS = 300;
const BENCHMARK_SUBMIT_MAX_ATTEMPTS = 3;

export class BenchmarkRunOrchestrator {
  private readonly dataset: BenchmarkDatasetService;
  private readonly env: Env;
  private readonly runs: BenchmarkRunStore;

  constructor(env: Env) {
    this.env = env;
    this.dataset = new BenchmarkDatasetService();
    this.runs = new BenchmarkRunStore(env.DB);
  }

  async create(input: CreateBenchmarkRunRequest) {
    const run = await this.runs.create({
      cleanupPolicy: input.cleanupPolicy,
      difficulty: input.difficulty,
      id: input.id ?? crypto.randomUUID(),
      modelId: input.model.id,
      modelProvider: input.model.provider,
      taskId: input.taskId,
    });

    if (input.autoStart) {
      await this.start(run.id, input);
      return this.runs.get(run.id);
    }

    return run;
  }

  async start(runId: string, request?: CreateBenchmarkRunRequest) {
    const run = await this.requireRun(runId);
    const record = this.dataset.getTaskRecord(run.taskId);
    const model = request?.model ?? {
      id: run.modelId,
      provider: run.modelProvider,
    };
    const tokenLimits = getBenchmarkTokenLimits(run.difficulty);
    const maxInputTokens =
      request?.maxInputTokens ?? tokenLimits.maxInputTokens;
    const maxOutputTokens =
      request?.maxOutputTokens ?? tokenLimits.maxOutputTokens;
    const maxSteps = request?.maxSteps ?? DEFAULT_BENCHMARK_MAX_STEPS;
    const maxToolCalls =
      request?.maxToolCalls ?? DEFAULT_BENCHMARK_MAX_TOOL_CALLS;
    const maxTotalTokens =
      request?.maxTotalTokens ?? tokenLimits.maxTotalTokens;
    const maxTurns = request?.maxTurns ?? DEFAULT_BENCHMARK_MAX_TURNS;
    const timeoutSeconds =
      request?.timeoutSeconds ?? DEFAULT_BENCHMARK_TIMEOUT_SECONDS;
    const autoFollowup = request?.autoFollowup ?? false;

    await this.runs.update({ id: runId, status: "running" });

    const artifactOwner = this.env.GITHUB_ORG ?? this.env.GITHUB_OWNER;

    try {
      const sessionConfig = toBenchmarkSessionConfig({
        ...(artifactOwner ? { artifactOwner } : {}),
        difficulty: run.difficulty,
        maxSteps,
        maxTurns,
        metadata: record.metadata,
        model,
        maxInputTokens,
        maxOutputTokens,
        maxToolCalls,
        maxTotalTokens,
        task: record.task,
        timeoutSeconds,
      });
      const sessionId = `bench-${runId}`;
      const artifact = await this.provisionArtifact({
        benchmark: sessionConfig.benchmark,
        sessionId,
      });
      const sessionIndex = new SessionIndexStore(this.env.DB);

      await sessionIndex.upsert({
        config: sessionConfig,
        id: sessionId,
        status: "pending",
      });

      let agent = await withDORetry(() =>
        getAgentByName(this.env.SESSION_AGENT, sessionId)
      );
      await withDORetry(() => agent.init(sessionId, sessionConfig, artifact));
      await sessionIndex.setArtifactState({
        artifact,
        eventId: `benchmark-artifact:${runId}`,
        id: sessionId,
      });
      await sessionIndex.setStatus({
        eventId: `benchmark-init:${runId}`,
        id: sessionId,
        status: "idle",
      });
      await this.runs.update({ id: runId, sessionId });
      await this.runs.addEvent({
        kind: "session_created",
        message: "Agent session created",
        runId,
      });

      await this.checkoutArtifact({
        artifact,
        ref: record.task.codebase.commit,
        runId,
        sessionId,
        ...(sessionConfig.sandbox?.profile
          ? { profile: sessionConfig.sandbox.profile }
          : {}),
      });

      // Re-obtain the agent stub after the potentially long checkout operation.
      // The DO may have hibernated while idle, and native RPC calls bypass the
      // partyserver #ensureInitialized() gate. Calling getAgentByName triggers
      // setName → onStart, which re-initializes this.session on the Think class.
      agent = await withDORetry(() =>
        getAgentByName(this.env.SESSION_AGENT, sessionId)
      );

      await this.runs.addEvent({
        kind: "agent_started",
        message: "Agent turn started",
        runId,
      });
      const turnResult = await withTimeout(
        agent.requestFollowUp(
          benchmarkInitialPrompt(record.task, run.difficulty, artifactOwner)
        ),
        (timeoutSeconds + AGENT_TURN_COMPLETION_GRACE_SECONDS) * 1000,
        `Agent turn did not complete within ${
          timeoutSeconds + AGENT_TURN_COMPLETION_GRACE_SECONDS
        }s`
      );
      if (turnResult.status !== "completed") {
        throw new Error(`Agent turn ${turnResult.status}`);
      }
      await this.runs.addEvent({
        details: turnResult,
        kind: "agent_completed",
        message: "Agent turn completed",
        runId,
      });

      const completedRun = await this.requireRun(runId);
      if (completedRun.status === "cancelled") {
        return completedRun;
      }

      const { candidates, finalRawOutput } = await this.resolveAgentOutput(
        runId,
        sessionId
      );
      const best = scoreBestCandidate(record.task, candidates);
      const result = await this.runs.putResult({
        agentOutput: best.output,
        rawOutput: finalRawOutput,
        runId,
        score: best.score,
        task: record.task,
      });
      await this.runs.update({
        artifactCommitSha: null,
        artifactPath: result.artifactPath,
        completedAt: new Date().toISOString(),
        id: runId,
        score: best.score.score,
        status: "completed",
      });
      await this.runs.addEvent({
        kind: "result_parsed",
        message: "Benchmark result parsed and scored",
        runId,
      });

      if (autoFollowup) {
        await new CveFollowupOrchestrator(
          this.env
        ).scheduleAfterBenchmarkCompletedIfEligible(runId);
      }

      const finalRun = await this.requireRun(runId);

      if (finalRun.cleanupPolicy !== "retain") {
        await this.cleanup(runId);
      }
    } catch (error) {
      const currentRun = await this.requireRun(runId);
      if (currentRun.status === "cancelled") {
        return currentRun;
      }

      const { message, rawOutput } = describeFailure(error);
      await this.failRun(currentRun, message, rawOutput);
    }

    return this.requireRun(runId);
  }

  async reconcile(runId: string): Promise<BenchmarkRunRow> {
    const run = await this.requireRun(runId);

    if (run.status !== "running" || !run.sessionId) {
      return run;
    }

    const session = await new SessionIndexStore(this.env.DB).get(run.sessionId);

    if (
      !session ||
      session.status === "pending" ||
      session.status === "running"
    ) {
      return run;
    }

    const events = await this.runs.listEvents(runId);
    const agentWasStarted = events.some(
      (event) => event.kind === "agent_started"
    );

    if (!agentWasStarted) {
      return run;
    }

    try {
      return await this.completeRunFromSession(runId);
    } catch (error) {
      const currentRun = await this.requireRun(runId);

      if (currentRun.status !== "running") {
        return currentRun;
      }

      const { message, rawOutput } = describeFailure(error);

      return this.failRun(currentRun, message, rawOutput);
    }
  }

  async cancel(runId: string) {
    const run = await this.requireRun(runId);

    await this.runs.addEvent({
      kind: "cancelled",
      message: "Benchmark run cancelled",
      runId,
    });

    if (run.sessionId) {
      const agent = await withDORetry(() =>
        getAgentByName(this.env.SESSION_AGENT, run.sessionId as string)
      );
      await withDORetry(() => agent.stopAndFinalize("Benchmark run cancelled"));
    }

    return this.runs.update({
      completedAt: new Date().toISOString(),
      id: runId,
      status: "cancelled",
    });
  }

  async cleanup(runId: string) {
    const run = await this.requireRun(runId);

    await this.runs.update({ id: runId, status: "cleaning_up" });

    if (
      run.sessionId &&
      (run.cleanupPolicy === "terminate_sandbox" ||
        run.cleanupPolicy === "archive_repo_and_terminate")
    ) {
      await ModalExecutor.fromEnv(this.env).terminate(run.sessionId);
    }

    if (
      run.sessionId &&
      (run.cleanupPolicy === "archive_repo" ||
        run.cleanupPolicy === "archive_repo_and_terminate")
    ) {
      const sessionId = run.sessionId;
      const agent = await withDORetry(() =>
        getAgentByName(this.env.SESSION_AGENT, sessionId)
      );
      const state = await withDORetry(() => agent.inspectState());

      if (
        state.artifact &&
        state.artifact.runRepoRemote !== state.artifact.targetRepoRemote
      ) {
        await createGitTreeStore(this.env).archiveRunRepo({
          repo: {
            cloneUrl: state.artifact.runRepoRemote,
            defaultBranch: state.artifact.workingBranch,
            fullName: state.artifact.runRepoName,
            name: state.artifact.runRepoName,
            provider: state.artifact.provider,
          },
        });
      }
    }

    await this.runs.addEvent({
      kind: "cleanup_completed",
      message: "Benchmark cleanup completed",
      runId,
    });

    return this.runs.update({
      cleanupCompletedAt: new Date().toISOString(),
      id: runId,
      status: "cleaned",
    });
  }

  private async provisionArtifact(input: {
    benchmark: BenchmarkConfig | undefined;
    sessionId: string;
  }): Promise<BenchmarkArtifactState> {
    if (!input.benchmark) {
      throw new Error(
        "Benchmark session config did not include artifact config"
      );
    }

    const store = createGitTreeStore(this.env);
    const targetRepo = await store.ensureStableTarget({
      target: input.benchmark.target,
    });

    return {
      benchmarkId: input.benchmark.target.benchmarkId,
      defaultBranch: targetRepo.defaultBranch,
      provider: targetRepo.provider,
      runRepoName: targetRepo.name,
      runRepoRemote: targetRepo.cloneUrl,
      status: "pending",
      targetRepoName: targetRepo.name,
      targetRepoRemote: targetRepo.cloneUrl,
      workingBranch: targetRepo.defaultBranch,
    };
  }

  private async checkoutArtifact(input: {
    artifact: BenchmarkArtifactState;
    profile?: SandboxProfileName;
    ref: string;
    runId: string;
    sessionId: string;
  }) {
    await this.runs.addEvent({
      kind: "checkout_started",
      message: "Checking out benchmark repository",
      runId: input.runId,
    });

    const credential = await createGitTreeStore(this.env).mintCredential({
      repo: {
        cloneUrl: input.artifact.runRepoRemote,
        defaultBranch: input.artifact.workingBranch,
        fullName: input.artifact.runRepoName,
        name: input.artifact.runRepoName,
        provider: input.artifact.provider,
      },
      scope: "read",
    });
    const checkoutOptions = {
      branch: input.artifact.workingBranch,
      credential,
      path: `/workspace/${input.artifact.runRepoName}`,
      ref: input.ref,
      remoteUrl: input.artifact.runRepoRemote,
      sessionId: input.sessionId,
      ...(input.profile ? { profile: input.profile } : {}),
    };
    const checkout = await ModalExecutor.fromEnv(this.env).checkoutGitRepo(
      checkoutOptions
    );

    await this.runs.addEvent({
      details: checkout,
      kind: "checkout_completed",
      message: "Benchmark repository checked out",
      runId: input.runId,
    });

    return checkout;
  }

  private async completeRunFromSession(
    runId: string
  ): Promise<BenchmarkRunRow> {
    const run = await this.requireRun(runId);

    if (run.status === "cancelled") {
      return run;
    }

    const existingResult = await this.runs.getLatestResult(runId);

    if (existingResult?.agentOutput) {
      return this.runs.update({
        artifactCommitSha: null,
        artifactPath: existingResult.artifactPath,
        completedAt: new Date().toISOString(),
        id: runId,
        score: existingResult.score?.score ?? null,
        status: "completed",
      });
    }

    if (existingResult?.error) {
      return this.runs.update({
        artifactPath: existingResult.artifactPath,
        completedAt: new Date().toISOString(),
        error: existingResult.error,
        id: runId,
        status: "failed",
      });
    }

    if (!run.sessionId) {
      throw new Error("Benchmark run has no session to read output from");
    }

    const record = this.dataset.getTaskRecord(run.taskId);
    const sessionId = run.sessionId;
    const { candidates, finalRawOutput } = await this.resolveAgentOutput(
      runId,
      sessionId
    );
    const best = scoreBestCandidate(record.task, candidates);
    const result = await this.runs.putResult({
      agentOutput: best.output,
      rawOutput: finalRawOutput,
      runId,
      score: best.score,
      task: record.task,
    });

    await this.addAgentCompletedEventIfMissing(runId);
    await this.runs.update({
      artifactCommitSha: null,
      artifactPath: result.artifactPath,
      completedAt: new Date().toISOString(),
      id: runId,
      score: best.score.score,
      status: "completed",
    });
    await this.runs.addEvent({
      kind: "result_parsed",
      message: "Benchmark result parsed and scored",
      runId,
    });

    await new CveFollowupOrchestrator(
      this.env
    ).scheduleAfterBenchmarkCompletedIfEligible(runId);

    const finalRun = await this.requireRun(runId);

    if (finalRun.cleanupPolicy !== "retain") {
      return this.cleanup(runId);
    }

    return finalRun;
  }

  private async failRun(
    run: BenchmarkRunRow,
    message: string,
    rawOutput?: string | null
  ): Promise<BenchmarkRunRow> {
    const record = this.dataset.getTaskRecord(run.taskId);
    const result = await this.runs.putResult({
      error: message,
      rawOutput: rawOutput ?? null,
      runId: run.id,
      task: record.task,
    });

    await this.runs.update({
      artifactPath: result.artifactPath,
      completedAt: new Date().toISOString(),
      error: message,
      id: run.id,
      status: "failed",
    });
    await this.runs.addEvent({
      kind: "failed",
      message,
      runId: run.id,
    });

    return this.requireRun(run.id);
  }

  private async resolveAgentOutput(
    runId: string,
    sessionId: string
  ): Promise<{ candidates: AgentOutput[]; finalRawOutput: string }> {
    const getAgent = async () =>
      withDORetry(() => getAgentByName(this.env.SESSION_AGENT, sessionId));

    let agent = await getAgent();
    const fromTool0 = await withDORetry(() =>
      agent.popPendingBenchmarkOutput()
    );
    if (fromTool0) {
      return {
        candidates: [fromTool0],
        finalRawOutput: JSON.stringify(fromTool0, null, 2),
      };
    }

    const raw0 = await this.readAssistantOutput(agent);
    let firstError: Error | undefined;
    try {
      return {
        candidates: parseAgentOutputs(raw0),
        finalRawOutput: raw0,
      };
    } catch (error) {
      firstError = error instanceof Error ? error : new Error(String(error));
    }

    if (!sessionId.startsWith("bench-")) {
      throw new ParseFailureError(
        firstError?.message ?? "parse failed",
        raw0,
        firstError
      );
    }

    await this.runs.addEvent({
      details: { error: firstError?.message, rawOutputLength: raw0.length },
      kind: "result_parse_failed",
      message:
        "Agent text did not parse; requesting submit_benchmark_result turn",
      runId,
    });

    await withDORetry(() => agent.enableBenchmarkSubmitMode());
    agent = await getAgent();
    return this.resolveBenchmarkSubmission({
      agent,
      firstError,
      getAgent,
      raw0,
      runId,
    });
  }

  private async resolveBenchmarkSubmission(input: {
    agent: BenchmarkSubmissionAgent;
    firstError: Error | undefined;
    getAgent: () => Promise<BenchmarkSubmissionAgent>;
    raw0: string;
    runId: string;
  }): Promise<{ candidates: AgentOutput[]; finalRawOutput: string }> {
    let agent = input.agent;
    let raw1 = "";
    let lastSubmissionError: Error | undefined;

    for (
      let attempt = 1;
      attempt <= BENCHMARK_SUBMIT_MAX_ATTEMPTS;
      attempt += 1
    ) {
      const prompt =
        attempt === 1
          ? BENCHMARK_SUBMIT_FOLLOWUP_PROMPT
          : `${BENCHMARK_SUBMIT_FOLLOWUP_PROMPT}\n\nPrevious submission attempt ${attempt - 1} did not record a valid result. You must call \`submit_benchmark_result\` now.`;
      let submitResult: SaveMessagesResult;
      try {
        submitResult = await withTimeout(
          withDORetry(() => agent.requestFollowUp(prompt)),
          BENCHMARK_SUBMIT_TURN_TIMEOUT_SECONDS * 1000,
          `Benchmark submission turn did not complete within ${BENCHMARK_SUBMIT_TURN_TIMEOUT_SECONDS}s`
        );
      } catch (retryError) {
        lastSubmissionError =
          retryError instanceof Error
            ? retryError
            : new Error(String(retryError));
        await this.runs.addEvent({
          details: { attempt, error: lastSubmissionError.message },
          kind: "result_parse_failed",
          message: "Benchmark submission turn failed; retrying if possible",
          runId: input.runId,
        });
        agent = await input.getAgent();
        continue;
      }

      if (submitResult.status !== "completed") {
        lastSubmissionError = new Error(
          `Submission turn ${submitResult.status}`
        );
        await this.runs.addEvent({
          details: { attempt, status: submitResult.status },
          kind: "result_parse_failed",
          message:
            "Benchmark submission turn did not complete; retrying if possible",
          runId: input.runId,
        });
        agent = await input.getAgent();
        continue;
      }

      agent = await input.getAgent();
      const fromTool1 = await withDORetry(() =>
        agent.popPendingBenchmarkOutput()
      );
      if (fromTool1) {
        return {
          candidates: [fromTool1],
          finalRawOutput: JSON.stringify(fromTool1, null, 2),
        };
      }

      raw1 = await this.readAssistantOutput(agent);
      try {
        return {
          candidates: parseAgentOutputs(raw1),
          finalRawOutput: raw1,
        };
      } catch (secondError) {
        lastSubmissionError =
          secondError instanceof Error
            ? secondError
            : new Error(String(secondError));
        await this.runs.addEvent({
          details: { attempt, error: lastSubmissionError.message },
          kind: "result_parse_failed",
          message:
            "Benchmark submission turn produced no valid result; retrying if possible",
          runId: input.runId,
        });
      }
    }

    throw new ParseFailureError(
      lastSubmissionError?.message ??
        input.firstError?.message ??
        "parse failed",
      raw1 || input.raw0,
      lastSubmissionError
    );
  }

  /**
   * Watchdog used by the cron handler. Finds runs that have been stuck in
   * `running` past `WATCHDOG_MAX_RUNNING_SECONDS` and finalizes them, so a
   * Worker invocation that died mid-`start()` can no longer leak rows.
   */
  async watchdogScan(): Promise<{ finalized: string[] }> {
    const cutoffMs = Date.now() - WATCHDOG_MAX_RUNNING_SECONDS * 1000;
    const cutoffIso = new Date(cutoffMs).toISOString();
    const runs = await this.runs.list();
    const stuck = runs.filter(
      (run) => run.status === "running" && run.createdAt < cutoffIso
    );
    const finalized: string[] = [];

    for (const run of stuck) {
      const reconciled = await this.reconcile(run.id).catch(() => run);

      if (reconciled.status !== "running") {
        finalized.push(run.id);
        continue;
      }

      const elapsedSeconds = Math.round(
        (Date.now() - new Date(run.createdAt).getTime()) / 1000
      );
      const message = `Watchdog timeout: run was in 'running' for ${elapsedSeconds}s (max ${WATCHDOG_MAX_RUNNING_SECONDS}s) without a terminal event`;

      await this.failRun(reconciled, message);
      finalized.push(run.id);
    }

    return { finalized };
  }

  private async addAgentCompletedEventIfMissing(runId: string): Promise<void> {
    const events = await this.runs.listEvents(runId);
    const agentCompleted = events.some(
      (event) => event.kind === "agent_completed"
    );

    if (agentCompleted) {
      return;
    }

    await this.runs.addEvent({
      details: { recovered: true },
      kind: "agent_completed",
      message: "Agent turn completed",
      runId,
    });
  }

  private async readAssistantOutput(agent: {
    getMessages(): Promise<unknown>;
  }): Promise<string> {
    const messages = (await agent.getMessages()) as Array<{
      parts?: Record<string, unknown>[];
      role?: string;
    }>;
    const assistantTexts = messages
      .filter((message) => message.role === "assistant")
      .map((message) =>
        message.parts
          ?.map((part) => (typeof part.text === "string" ? part.text : ""))
          .join("")
          .trim()
      )
      .filter((text): text is string => Boolean(text));

    return assistantTexts.at(-1) ?? "";
  }

  private async requireRun(runId: string) {
    const run = await this.runs.get(runId);

    if (!run) {
      throw new Error(`Benchmark run ${runId} not found`);
    }

    return run;
  }
}

class ParseFailureError extends Error {
  readonly rawOutput: string;

  constructor(message: string, rawOutput: string, cause?: Error) {
    super(message, cause ? { cause } : undefined);
    this.name = "ParseFailureError";
    this.rawOutput = rawOutput;
  }
}

const describeFailure = (
  error: unknown
): { message: string; rawOutput: string | null } => {
  if (error instanceof ParseFailureError) {
    return {
      message: `Agent did not return a JSON benchmark result (after one retry): ${error.message}`,
      rawOutput: error.rawOutput,
    };
  }

  return {
    message: error instanceof Error ? error.message : String(error),
    rawOutput: null,
  };
};

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
};
