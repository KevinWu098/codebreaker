import {
  type CreateBenchmarkRunRequest,
  CreateBenchmarkRunRequestSchema,
} from "@codebreaker/benchmark-runner/schemas";
import { createGitTreeStore } from "@codebreaker/control-plane/artifacts/repository";
import { BenchmarkDatasetService } from "@codebreaker/control-plane/benchmarks/dataset";
import { BenchmarkRunOrchestrator } from "@codebreaker/control-plane/benchmarks/orchestrator";
import { BenchmarkRunStore } from "@codebreaker/control-plane/db/benchmark-runs";
import { SessionIndexStore } from "@codebreaker/control-plane/db/session-index";
import { withDORetry } from "@codebreaker/control-plane/do/retry";
import { jwtAuth } from "@codebreaker/control-plane/http/auth";
import { parseAllowedOrigins } from "@codebreaker/control-plane/http/cors";
import { jsonError } from "@codebreaker/control-plane/http/errors";
import {
  type ExecRemoteOptions,
  ModalExecutor,
} from "@codebreaker/control-plane/sandbox/modal";
import type { Env } from "@codebreaker/control-plane/types";
import {
  ArtifactCheckoutRequestSchema,
  ArtifactCommitRequestSchema,
  CreateSessionRequestSchema,
  FinalizeSessionRequestSchema,
  InspectExecRequestSchema,
  ListSessionsQuerySchema,
  UpdateArtifactStateRequestSchema,
} from "@codebreaker/shared/schemas/api";
import type {
  BenchmarkArtifactState,
  BenchmarkConfig,
} from "@codebreaker/shared/schemas/artifacts";
import { BenchmarkArtifactStateSchema } from "@codebreaker/shared/schemas/artifacts";
import { zValidator } from "@hono/zod-validator";
import { getAgentByName } from "agents";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";

const SessionParamsSchema = z.object({
  id: z.string().min(1),
});

const BenchmarkRunParamsSchema = z.object({
  id: z.string().min(1),
});

interface RouterVariables {
  executor: ModalExecutor;
  sessionStore: SessionIndexStore;
}

export const createRouter = (): Hono<{
  Bindings: Env;
  Variables: RouterVariables;
}> => {
  const app = new Hono<{ Bindings: Env; Variables: RouterVariables }>();

  app.use("*", (context, next) => {
    context.set("sessionStore", new SessionIndexStore(context.env.DB));
    context.set("executor", ModalExecutor.fromEnv(context.env));

    const allowedOrigins = parseAllowedOrigins(context.env.ALLOWED_ORIGINS);

    if (allowedOrigins.length === 0) {
      return next();
    }

    return cors({
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "HEAD", "OPTIONS"],
      credentials: true,
      maxAge: 86_400,
      origin: (origin) => {
        if (allowedOrigins.includes("*")) {
          return origin;
        }

        return allowedOrigins.includes(origin) ? origin : null;
      },
    })(context, next);
  });

  app.get("/health", (context) =>
    context.json({
      ok: true,
    })
  );

  app.use("/sessions/*", jwtAuth);
  app.use("/benchmark-tasks", jwtAuth);
  app.use("/benchmark-runs", jwtAuth);
  app.use("/benchmark-runs/*", jwtAuth);
  app.use("/admin/*", jwtAuth);

  app.get(
    "/sessions",
    zValidator("query", ListSessionsQuerySchema),
    async (context) => {
      const query = context.req.valid("query");
      const sessions = await context.get("sessionStore").list(query);

      return context.json({
        limit: query.limit,
        offset: query.offset,
        sessions,
      });
    }
  );

  app.get("/benchmark-tasks", (context) => {
    const dataset = new BenchmarkDatasetService();

    return context.json({
      tasks: dataset.listTasks(),
    });
  });

  app.get("/benchmark-runs", async (context) => {
    const store = new BenchmarkRunStore(context.env.DB);

    return context.json({
      runs: await store.list(),
    });
  });

  app.post(
    "/benchmark-runs",
    zValidator("json", CreateBenchmarkRunRequestSchema),
    async (context) => {
      const request = context.req.valid("json");
      const orchestrator = new BenchmarkRunOrchestrator(context.env);
      const run = await orchestrator.create({
        ...request,
        autoStart: false,
      });

      if (!run) {
        return jsonError(
          "Benchmark run was not created",
          "benchmark_run_not_created",
          500
        );
      }

      if (request.autoStart) {
        context.executionCtx.waitUntil(
          orchestrator.start(run.id, request).then(() => undefined)
        );
      }

      return context.json({ run }, 201);
    }
  );

  app.get(
    "/benchmark-runs/:id",
    zValidator("param", BenchmarkRunParamsSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const store = new BenchmarkRunStore(context.env.DB);
      const dataset = new BenchmarkDatasetService();
      const run = await store.get(id);

      if (!run) {
        return jsonError("Benchmark run not found", "run_not_found", 404);
      }

      const result = await store.getLatestResult(id);

      return context.json({
        events: await store.listEvents(id),
        locations: await store.listLocations({
          ...(result ? { resultId: result.id } : {}),
          runId: id,
        }),
        result,
        run,
        task: dataset.getTask(run.taskId),
      });
    }
  );

  app.post(
    "/benchmark-runs/:id/start",
    zValidator("param", BenchmarkRunParamsSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const store = new BenchmarkRunStore(context.env.DB);
      const run = await store.get(id);

      if (!run) {
        return jsonError("Benchmark run not found", "run_not_found", 404);
      }

      const request: CreateBenchmarkRunRequest = {
        autoStart: false,
        cleanupPolicy: run.cleanupPolicy,
        difficulty: run.difficulty,
        maxTurns: 20,
        model: {
          id: run.modelId,
          provider: run.modelProvider,
        },
        taskId: run.taskId,
        timeoutSeconds: 900,
      };
      context.executionCtx.waitUntil(
        new BenchmarkRunOrchestrator(context.env)
          .start(id, request)
          .then(() => undefined)
      );

      return context.json({
        run: await store.update({ id, status: "running" }),
      });
    }
  );

  app.post(
    "/benchmark-runs/:id/cancel",
    zValidator("param", BenchmarkRunParamsSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const run = await new BenchmarkRunOrchestrator(context.env).cancel(id);

      return context.json({ run });
    }
  );

  app.post(
    "/benchmark-runs/:id/cleanup",
    zValidator("param", BenchmarkRunParamsSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const run = await new BenchmarkRunOrchestrator(context.env).cleanup(id);

      return context.json({ run });
    }
  );

  app.post(
    "/sessions",
    zValidator("json", CreateSessionRequestSchema),
    async (context) => {
      const request = context.req.valid("json");
      const id = request.id ?? crypto.randomUUID();
      const store = context.get("sessionStore");
      const artifact = request.config.benchmark
        ? await provisionArtifactState({
            benchmark: request.config.benchmark,
            env: context.env,
            sessionId: id,
          })
        : undefined;
      let session = await store.upsert({
        config: request.config,
        id,
        status: "pending",
      });
      const agent = await withDORetry(() =>
        getAgentByName(context.env.SESSION_AGENT, id)
      );

      await withDORetry(() => agent.init(id, request.config, artifact));
      if (artifact) {
        await store.setArtifactState({
          artifact,
          eventId: `artifact:init:${id}`,
          id,
        });
        session = (await store.get(id)) ?? session;
      }
      await store.setStatus({
        eventId: `init:${id}`,
        id,
        status: "idle",
      });

      return context.json({ session }, 201);
    }
  );

  app.get(
    "/sessions/:id",
    zValidator("param", SessionParamsSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const session = await context.get("sessionStore").get(id);

      if (!session) {
        return jsonError("Session not found", "session_not_found", 404);
      }

      return context.json({ session });
    }
  );

  app.delete(
    "/sessions/:id",
    zValidator("param", SessionParamsSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const agent = await withDORetry(() =>
        getAgentByName(context.env.SESSION_AGENT, id)
      );

      await withDORetry(() => agent.archive());
      await context.get("sessionStore").setStatus({
        completedAt: new Date().toISOString(),
        eventId: `archive:${id}`,
        id,
        status: "archived",
      });

      return context.json({ ok: true });
    }
  );

  app.post(
    "/sessions/:id/finalize",
    zValidator("param", SessionParamsSchema),
    zValidator("json", FinalizeSessionRequestSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const request = context.req.valid("json");
      const agent = await withDORetry(() =>
        getAgentByName(context.env.SESSION_AGENT, id)
      );
      const result = await withDORetry(() =>
        agent.stopAndFinalize(request.reason)
      );

      return context.json({ result });
    }
  );

  app.get(
    "/sessions/:id/messages",
    zValidator("param", SessionParamsSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const agent = await withDORetry(() =>
        getAgentByName(context.env.SESSION_AGENT, id)
      );

      return context.json({
        messages: await withDORetry(() => agent.getMessages()),
      });
    }
  );

  app.get(
    "/sessions/:id/config",
    zValidator("param", SessionParamsSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const agent = await withDORetry(() =>
        getAgentByName(context.env.SESSION_AGENT, id)
      );

      return context.json({
        config: await withDORetry(() => agent.inspectConfig()),
      });
    }
  );

  app.get(
    "/sessions/:id/state",
    zValidator("param", SessionParamsSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const agent = await withDORetry(() =>
        getAgentByName(context.env.SESSION_AGENT, id)
      );

      return context.json({
        state: await withDORetry(() => agent.inspectState()),
      });
    }
  );

  app.get(
    "/sessions/:id/sandbox",
    zValidator("param", SessionParamsSchema),
    async (context) => {
      const { id } = context.req.valid("param");

      return context.json({
        sandbox: await context.get("executor").getSandbox(id),
      });
    }
  );

  app.post(
    "/sessions/:id/sandbox/exec",
    zValidator("param", SessionParamsSchema),
    zValidator("json", InspectExecRequestSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const request = context.req.valid("json");
      const execOptions: ExecRemoteOptions = {
        command: request.command,
        sessionId: id,
      };

      if (request.cwd) {
        execOptions.cwd = request.cwd;
      }

      if (request.profile) {
        execOptions.profile = request.profile;
      }

      if (request.timeoutSeconds) {
        execOptions.timeoutSeconds = request.timeoutSeconds;
      }

      return context.json({
        result: await context.get("executor").exec(execOptions),
      });
    }
  );

  app.get(
    "/sessions/:id/artifacts",
    zValidator("param", SessionParamsSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const agent = await withDORetry(() =>
        getAgentByName(context.env.SESSION_AGENT, id)
      );
      const state = await withDORetry(() => agent.inspectState());

      return context.json({
        artifact: state.artifact ?? null,
      });
    }
  );

  app.patch(
    "/sessions/:id/artifacts",
    zValidator("param", SessionParamsSchema),
    zValidator("json", UpdateArtifactStateRequestSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const updates = context.req.valid("json");
      const agent = await withDORetry(() =>
        getAgentByName(context.env.SESSION_AGENT, id)
      );
      const state = await withDORetry(() => agent.inspectState());
      const artifact = requireArtifactState(state.artifact);
      const nextArtifact = BenchmarkArtifactStateSchema.parse({
        ...artifact,
        ...updates,
      });

      await withDORetry(() => agent.setArtifactState(nextArtifact));

      return context.json({
        artifact: nextArtifact,
      });
    }
  );

  app.post(
    "/sessions/:id/artifacts/checkout",
    zValidator("param", SessionParamsSchema),
    zValidator("json", ArtifactCheckoutRequestSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const request = context.req.valid("json");
      const agent = await withDORetry(() =>
        getAgentByName(context.env.SESSION_AGENT, id)
      );
      const state = await withDORetry(() => agent.inspectState());
      const artifact = requireArtifactState(state.artifact);
      const store = createGitTreeStore(context.env);
      const credential = await store.mintCredential({
        repo: {
          cloneUrl: artifact.runRepoRemote,
          defaultBranch: artifact.workingBranch,
          fullName: artifact.runRepoName,
          name: artifact.runRepoName,
          provider: artifact.provider,
        },
        scope: "read",
      });
      const result = await context.get("executor").checkoutGitRepo({
        branch: artifact.workingBranch,
        credential,
        path: request.path ?? `/workspace/${artifact.runRepoName}`,
        profile: request.profile,
        ref: request.ref,
        remoteUrl: artifact.runRepoRemote,
        sessionId: id,
      });
      const nextArtifact = result.commitSha
        ? BenchmarkArtifactStateSchema.parse({
            ...artifact,
            latestCommitSha: result.commitSha,
          })
        : artifact;

      if (nextArtifact !== artifact) {
        await withDORetry(() => agent.setArtifactState(nextArtifact));
      }

      return context.json({
        artifact: nextArtifact,
        result,
      });
    }
  );

  app.post(
    "/sessions/:id/artifacts/commit",
    zValidator("param", SessionParamsSchema),
    zValidator("json", ArtifactCommitRequestSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const request = context.req.valid("json");
      const agent = await withDORetry(() =>
        getAgentByName(context.env.SESSION_AGENT, id)
      );
      const state = await withDORetry(() => agent.inspectState());
      const artifact = requireArtifactState(state.artifact);
      const repoPath = `/workspace/${artifact.runRepoName}`;
      const store = createGitTreeStore(context.env);
      const credential = await store.mintCredential({
        repo: {
          cloneUrl: artifact.runRepoRemote,
          defaultBranch: artifact.workingBranch,
          fullName: artifact.runRepoName,
          name: artifact.runRepoName,
          provider: artifact.provider,
        },
        scope: "write",
      });
      const result = await context.get("executor").commitGitRepo({
        branch: artifact.workingBranch,
        credential,
        message: request.message,
        path: repoPath,
        paths: request.paths,
        profile: request.profile,
        remoteUrl: artifact.runRepoRemote,
        sessionId: id,
      });
      const nextArtifact = BenchmarkArtifactStateSchema.parse({
        ...artifact,
        ...(result.commitSha ? { latestCommitSha: result.commitSha } : {}),
        status: result.pushed ? "draft" : artifact.status,
      });

      await withDORetry(() => agent.setArtifactState(nextArtifact));

      return context.json({
        artifact: nextArtifact,
        result,
      });
    }
  );

  app.get("/admin/shim/health", async (context) =>
    context.json({
      health: await context.get("executor").health(),
    })
  );

  app.get("/admin/shim/sandboxes", async (context) =>
    context.json({
      sandboxes: await context.get("executor").listSandboxes(),
    })
  );

  app.notFound(() => jsonError("Not found", "not_found", 404));

  app.onError((error) =>
    jsonError(
      error instanceof Error ? error.message : "Unexpected error",
      "internal_error",
      500
    )
  );

  return app;
};

const provisionArtifactState = async (input: {
  benchmark: BenchmarkConfig;
  env: Env;
  sessionId: string;
}): Promise<BenchmarkArtifactState> => {
  const store = createGitTreeStore(input.env);
  const targetRepo = await store.ensureStableTarget({
    target: input.benchmark.target,
  });
  const createRunRepoInput = {
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
  };
  const runRepo = await store.createRunRepo(createRunRepoInput);

  return BenchmarkArtifactStateSchema.parse({
    benchmarkId: input.benchmark.target.benchmarkId,
    defaultBranch: targetRepo.defaultBranch,
    provider: runRepo.provider,
    runRepoName: runRepo.name,
    runRepoRemote: runRepo.cloneUrl,
    status: "pending",
    targetRepoName: targetRepo.name,
    targetRepoRemote: targetRepo.cloneUrl,
    workingBranch: runRepo.defaultBranch,
  });
};

const requireArtifactState = (
  artifact: BenchmarkArtifactState | undefined
): BenchmarkArtifactState => {
  if (!artifact) {
    throw new Error("Session does not have benchmark artifacts configured");
  }

  return artifact;
};
