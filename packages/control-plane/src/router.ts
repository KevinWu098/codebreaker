import { SessionIndexStore } from "@codebreaker/control-plane/db/session-index";
import { jwtAuth } from "@codebreaker/control-plane/http/auth";
import { jsonError } from "@codebreaker/control-plane/http/errors";
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

  app.use("*", cors());

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

      await agent.init(request.config);
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
      const response = await fetch(
        `${context.env.MODAL_SHIM_URL}/sandboxes/${id}`,
        {
          headers: {
            "X-Shim-Secret": context.env.MODAL_SHIM_SECRET,
          },
        }
      );

      return new Response(response.body, {
        headers: response.headers,
        status: response.status,
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
      const response = await fetch(`${context.env.MODAL_SHIM_URL}/exec`, {
        body: JSON.stringify({
          ...request,
          session_id: id,
        }),
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": crypto.randomUUID(),
          "X-Shim-Secret": context.env.MODAL_SHIM_SECRET,
        },
        method: "POST",
      });

      return new Response(response.body, {
        headers: response.headers,
        status: response.status,
      });
    }
  );

  app.get("/admin/shim/health", async (context) => {
    const response = await fetch(`${context.env.MODAL_SHIM_URL}/health`);

    return new Response(response.body, {
      headers: response.headers,
      status: response.status,
    });
  });

  app.get("/admin/shim/sandboxes", async (context) => {
    const response = await fetch(`${context.env.MODAL_SHIM_URL}/sandboxes`, {
      headers: {
        "X-Shim-Secret": context.env.MODAL_SHIM_SECRET,
      },
    });

    return new Response(response.body, {
      headers: response.headers,
      status: response.status,
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
