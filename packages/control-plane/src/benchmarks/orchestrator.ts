import type {
  AgentOutput,
  CreateBenchmarkRunRequest,
} from "@codebreaker/benchmark-runner/schemas";
import {
  AgentOutputSchema,
  scoreAgentOutput,
} from "@codebreaker/benchmark-runner/schemas";
import {
  benchmarkInitialPrompt,
  toBenchmarkSessionConfig,
} from "@codebreaker/benchmark-runner/session-config";
import { createGitTreeStore } from "@codebreaker/control-plane/artifacts/repository";
import { BenchmarkDatasetService } from "@codebreaker/control-plane/benchmarks/dataset";
import { BenchmarkRunStore } from "@codebreaker/control-plane/db/benchmark-runs";
import { SessionIndexStore } from "@codebreaker/control-plane/db/session-index";
import { withDORetry } from "@codebreaker/control-plane/do/retry";
import { ModalExecutor } from "@codebreaker/control-plane/sandbox/modal";
import type { Env } from "@codebreaker/control-plane/types";
import type {
  BenchmarkArtifactState,
  BenchmarkConfig,
} from "@codebreaker/shared/schemas/artifacts";
import { getAgentByName } from "agents";

const RESULT_PATH = "codebreaker-result.json";

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
    const maxTurns = request?.maxTurns ?? 20;
    const timeoutSeconds = request?.timeoutSeconds ?? 1800;

    await this.runs.update({ id: runId, status: "running" });

    try {
      const sessionConfig = toBenchmarkSessionConfig({
        difficulty: run.difficulty,
        maxTurns,
        metadata: record.metadata,
        model,
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

      const agent = await withDORetry(() =>
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

      const checkout = await this.checkoutArtifact({
        artifact,
        ref: record.task.codebase.commit,
        runId,
        sessionId,
      });

      await agent.requestFollowUp(
        benchmarkInitialPrompt(record.task, run.difficulty)
      );
      await this.runs.addEvent({
        kind: "agent_started",
        message: "Agent turn started",
        runId,
      });
      await agent.continuePreviousTurn();
      await this.runs.addEvent({
        kind: "agent_completed",
        message: "Agent turn completed",
        runId,
      });

      const rawOutput = await this.readAssistantOutput(agent);
      const agentOutput = parseAgentOutput(rawOutput);
      const score = agentOutput
        ? scoreAgentOutput(record.task, agentOutput)
        : null;
      const artifactPath = `${checkout.repoPath}/${RESULT_PATH}`;

      await new ModalExecutor({
        secret: this.env.MODAL_SHIM_SECRET,
        url: this.env.MODAL_SHIM_URL,
      }).writeFile({
        content: new TextEncoder().encode(
          JSON.stringify(
            {
              agentOutput,
              rawOutput,
              score,
            },
            null,
            2
          )
        ),
        path: artifactPath,
        sessionId,
      });

      const commit = await this.commitArtifact({
        artifact,
        artifactPath,
        runId,
        sessionId,
      });
      await this.runs.putResult({
        agentOutput,
        artifactPath,
        rawOutput,
        runId,
        score,
      });
      await this.runs.update({
        artifactCommitSha: commit.commitSha ?? checkout.commitSha ?? null,
        artifactPath,
        completedAt: new Date().toISOString(),
        id: runId,
        score: score?.score ?? null,
        status: "completed",
      });
      await this.runs.addEvent({
        kind: "result_parsed",
        message: "Benchmark result parsed and scored",
        runId,
      });

      const finalRun = await this.requireRun(runId);

      if (finalRun.cleanupPolicy !== "retain") {
        await this.cleanup(runId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.runs.putResult({
        error: message,
        rawOutput: null,
        runId,
      });
      await this.runs.update({
        completedAt: new Date().toISOString(),
        error: message,
        id: runId,
        status: "failed",
      });
      await this.runs.addEvent({
        kind: "failed",
        message,
        runId,
      });
    }

    return this.requireRun(runId);
  }

  async cancel(runId: string) {
    await this.runs.addEvent({
      kind: "cancelled",
      message: "Benchmark run cancelled",
      runId,
    });

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

      if (state.artifact) {
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
    const runRepo = await store.createRunRepo({
      benchmarkId: input.benchmark.target.benchmarkId,
      sessionId: input.sessionId,
      sourceRepo: targetRepo,
      workingBranch: input.benchmark.artifacts.workingBranch,
      ...(input.benchmark.artifacts.agentId
        ? { agentId: input.benchmark.artifacts.agentId }
        : {}),
      ...(input.benchmark.artifacts.runRepoName
        ? { runRepoName: input.benchmark.artifacts.runRepoName }
        : {}),
    });

    return {
      benchmarkId: input.benchmark.target.benchmarkId,
      defaultBranch: targetRepo.defaultBranch,
      provider: runRepo.provider,
      runRepoName: runRepo.name,
      runRepoRemote: runRepo.cloneUrl,
      status: "pending",
      targetRepoName: targetRepo.name,
      targetRepoRemote: targetRepo.cloneUrl,
      workingBranch: runRepo.defaultBranch,
    };
  }

  private async checkoutArtifact(input: {
    artifact: BenchmarkArtifactState;
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
    const checkout = await ModalExecutor.fromEnv(this.env).checkoutGitRepo({
      branch: input.artifact.workingBranch,
      credential,
      path: `/workspace/${input.artifact.runRepoName}`,
      ref: input.ref,
      remoteUrl: input.artifact.runRepoRemote,
      sessionId: input.sessionId,
    });

    await this.runs.addEvent({
      details: checkout,
      kind: "checkout_completed",
      message: "Benchmark repository checked out",
      runId: input.runId,
    });

    return checkout;
  }

  private async commitArtifact(input: {
    artifact: BenchmarkArtifactState;
    artifactPath: string;
    runId: string;
    sessionId: string;
  }) {
    const credential = await createGitTreeStore(this.env).mintCredential({
      repo: {
        cloneUrl: input.artifact.runRepoRemote,
        defaultBranch: input.artifact.workingBranch,
        fullName: input.artifact.runRepoName,
        name: input.artifact.runRepoName,
        provider: input.artifact.provider,
      },
      scope: "write",
    });
    const commit = await ModalExecutor.fromEnv(this.env).commitGitRepo({
      branch: input.artifact.workingBranch,
      credential,
      message: `Record benchmark result ${input.runId}`,
      path: `/workspace/${input.artifact.runRepoName}`,
      paths: [RESULT_PATH],
      remoteUrl: input.artifact.runRepoRemote,
      sessionId: input.sessionId,
    });

    await this.runs.addEvent({
      details: commit,
      kind: "artifact_committed",
      message: "Benchmark artifact committed",
      runId: input.runId,
    });

    return commit;
  }

  private async readAssistantOutput(agent: {
    getMessages(): Promise<unknown>;
  }): Promise<string> {
    const messages = (await agent.getMessages()) as Array<{
      parts?: Record<string, unknown>[];
      role?: string;
    }>;
    const assistant = messages
      .filter((message) => message.role === "assistant")
      .at(-1);
    const text = assistant?.parts
      ?.map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();

    return text ?? "";
  }

  private async requireRun(runId: string) {
    const run = await this.runs.get(runId);

    if (!run) {
      throw new Error(`Benchmark run ${runId} not found`);
    }

    return run;
  }
}

const parseAgentOutput = (rawOutput: string): AgentOutput | null => {
  const json = extractJsonObject(rawOutput);

  if (!json) {
    return null;
  }

  const parsed = JSON.parse(json) as unknown;

  return AgentOutputSchema.parse(parsed);
};

const extractJsonObject = (value: string): string | null => {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return value.slice(start, end + 1);
};
