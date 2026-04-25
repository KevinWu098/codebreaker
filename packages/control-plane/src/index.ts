import { verifyRequestJwt } from "@codebreaker/control-plane/http/auth";
import { buildCorsHeaders } from "@codebreaker/control-plane/http/cors";
import { createRouter } from "@codebreaker/control-plane/router";
import type { Env } from "@codebreaker/control-plane/types";
import { routeAgentRequest } from "agents";

// biome-ignore lint/performance/noBarrelFile: Cloudflare requires Durable Object classes to be exported from the Worker entrypoint.
export { SessionAgent } from "@codebreaker/control-plane/session/agent";

const router = createRouter();

const unauthorized = (corsHeaders: HeadersInit | undefined): Response =>
  new Response(
    JSON.stringify({ code: "unauthorized", message: "Unauthorized" }),
    {
      headers: { "Content-Type": "application/json", ...(corsHeaders ?? {}) },
      status: 401,
    }
  );

const forbiddenOrigin = (): Response =>
  new Response(
    JSON.stringify({ code: "forbidden_origin", message: "Origin not allowed" }),
    {
      headers: { "Content-Type": "application/json" },
      status: 403,
    }
  );

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = buildCorsHeaders(request, env);

    const agentResponse = await routeAgentRequest(request, env, {
      cors: corsHeaders ?? false,
      onBeforeConnect: async (req) => {
        const origin = req.headers.get("Origin");

        if (origin && !corsHeaders) {
          return forbiddenOrigin();
        }

        if (!(await verifyRequestJwt(req, env.JWT_SECRET))) {
          return unauthorized(corsHeaders);
        }
      },
      onBeforeRequest: async (req) => {
        if (req.method === "OPTIONS") {
          return;
        }

        const origin = req.headers.get("Origin");

        if (origin && !corsHeaders) {
          return forbiddenOrigin();
        }

        if (!(await verifyRequestJwt(req, env.JWT_SECRET))) {
          return unauthorized(corsHeaders);
        }
      },
    });

    if (agentResponse) {
      return agentResponse;
    }

    return router.fetch(request, env);
  },
};
