import { verifyRequestJwt } from "@codebreaker/control-plane/http/auth";
import {
  handlePreflight,
  withCorsHeaders,
} from "@codebreaker/control-plane/http/cors";
import { createRouter } from "@codebreaker/control-plane/router";
import type { Env } from "@codebreaker/control-plane/types";
import { routeAgentRequest } from "agents";

// biome-ignore lint/performance/noBarrelFile: Cloudflare requires Durable Object classes to be exported from the Worker entrypoint.
export { SessionAgent } from "@codebreaker/control-plane/session/agent";

const router = createRouter();

const isAgentRoute = (request: Request): boolean => {
  const url = new URL(request.url);
  return url.pathname.startsWith("/agents/");
};

const unauthorized = (origin: string | null, env: Env): Response =>
  withCorsHeaders(
    new Response(
      JSON.stringify({ code: "unauthorized", message: "Unauthorized" }),
      {
        headers: { "Content-Type": "application/json" },
        status: 401,
      }
    ),
    origin,
    env
  );

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");

    if (isAgentRoute(request)) {
      const preflight = handlePreflight(request, env);

      if (preflight) {
        return preflight;
      }

      const agentResponse = await routeAgentRequest(request, env, {
        onBeforeConnect: async (req) => {
          if (!(await verifyRequestJwt(req, env.JWT_SECRET))) {
            return unauthorized(origin, env);
          }
        },
        onBeforeRequest: async (req) => {
          if (!(await verifyRequestJwt(req, env.JWT_SECRET))) {
            return unauthorized(origin, env);
          }
        },
      });

      if (agentResponse) {
        return withCorsHeaders(agentResponse, origin, env);
      }
    }

    return router.fetch(request, env);
  },
};
