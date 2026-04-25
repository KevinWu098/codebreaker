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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("origin");

    // CORS preflight for agent routes (Hono handles its own routes).
    if (isAgentRoute(request)) {
      const preflight = handlePreflight(request);

      if (preflight) {
        return preflight;
      }

      const agentResponse = await routeAgentRequest(request, env);

      if (agentResponse) {
        return withCorsHeaders(agentResponse, origin);
      }
    }

    return router.fetch(request, env);
  },
};
