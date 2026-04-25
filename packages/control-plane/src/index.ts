import { createRouter } from "@codebreaker/control-plane/router";
import type { Env } from "@codebreaker/control-plane/types";
import { routeAgentRequest } from "agents";

// biome-ignore lint/performance/noBarrelFile: Cloudflare requires Durable Object classes to be exported from the Worker entrypoint.
export { SessionAgent } from "@codebreaker/control-plane/session/agent";

const router = createRouter();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const agentResponse = await routeAgentRequest(request, env);

    if (agentResponse) {
      return agentResponse;
    }

    return router.fetch(request, env);
  },
};
