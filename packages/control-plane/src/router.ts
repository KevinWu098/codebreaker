import { SessionIndexStore } from "@codebreaker/control-plane/db/session-index";
import { jwtAuth } from "@codebreaker/control-plane/http/auth";
import { parseAllowedOrigins } from "@codebreaker/control-plane/http/cors";
import { jsonError } from "@codebreaker/control-plane/http/errors";
import {
  type ExecRemoteOptions,
  ModalExecutor,
} from "@codebreaker/control-plane/sandbox/modal";
import type { Env } from "@codebreaker/control-plane/types";
import {
  CreateSessionRequestSchema,
  InspectExecRequestSchema,
  ListSessionsQuerySchema,
} from "@codebreaker/shared/schemas/api";
import { zValidator } from "@hono/zod-validator";
import { getAgentByName } from "agents";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";

const SessionParamsSchema = z.object({
  id: z.string().min(1),
});

export const createRouter = (): Hono<{ Bindings: Env }> => {
  const app = new Hono<{ Bindings: Env }>();

  app.use("*", (context, next) => {
    const allowedOrigins = parseAllowedOrigins(context.env.ALLOWED_ORIGINS);

    if (allowedOrigins.length === 0) {
      return next();
    }

    return cors({
      allowHeaders: ["Content-Type", "Authorization"],
      allowMethods: ["GET", "POST", "DELETE", "HEAD", "OPTIONS"],
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
  app.use("/admin/*", jwtAuth);

  app.get(
    "/sessions",
    zValidator("query", ListSessionsQuerySchema),
    async (context) => {
      const query = context.req.valid("query");
      const store = new SessionIndexStore(context.env.DB);
      const sessions = await store.list(query);

      return context.json({
        limit: query.limit,
        offset: query.offset,
        sessions,
      });
    }
  );

  app.post(
    "/sessions",
    zValidator("json", CreateSessionRequestSchema),
    async (context) => {
      const request = context.req.valid("json");
      const id = request.id ?? crypto.randomUUID();
      const store = new SessionIndexStore(context.env.DB);
      const session = await store.upsert({
        config: request.config,
        id,
        status: "pending",
      });
      const agent = await getAgentByName(context.env.SESSION_AGENT, id);

      await agent.init(id, request.config);
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
      const store = new SessionIndexStore(context.env.DB);
      const session = await store.get(id);

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
      const agent = await getAgentByName(context.env.SESSION_AGENT, id);
      const store = new SessionIndexStore(context.env.DB);

      await agent.archive();
      await store.setStatus({
        completedAt: new Date().toISOString(),
        eventId: `archive:${id}`,
        id,
        status: "archived",
      });

      return context.json({ ok: true });
    }
  );

  app.get(
    "/sessions/:id/messages",
    zValidator("param", SessionParamsSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const agent = await getAgentByName(context.env.SESSION_AGENT, id);

      return context.json({
        messages: await agent.getMessages(),
      });
    }
  );

  app.get(
    "/sessions/:id/config",
    zValidator("param", SessionParamsSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const agent = await getAgentByName(context.env.SESSION_AGENT, id);

      return context.json({
        config: await agent.inspectConfig(),
      });
    }
  );

  app.get(
    "/sessions/:id/state",
    zValidator("param", SessionParamsSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const agent = await getAgentByName(context.env.SESSION_AGENT, id);

      return context.json({
        state: await agent.inspectState(),
      });
    }
  );

  app.get(
    "/sessions/:id/sandbox",
    zValidator("param", SessionParamsSchema),
    async (context) => {
      const { id } = context.req.valid("param");
      const executor = ModalExecutor.fromEnv(context.env);

      return context.json({
        sandbox: await executor.getSandbox(id),
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
      const executor = ModalExecutor.fromEnv(context.env);
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
        result: await executor.exec(execOptions),
      });
    }
  );

  app.get("/admin/shim/health", async (context) => {
    const executor = ModalExecutor.fromEnv(context.env);

    return context.json({
      health: await executor.health(),
    });
  });

  app.get("/admin/shim/sandboxes", async (context) => {
    const executor = ModalExecutor.fromEnv(context.env);

    return context.json({
      sandboxes: await executor.listSandboxes(),
    });
  });

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
