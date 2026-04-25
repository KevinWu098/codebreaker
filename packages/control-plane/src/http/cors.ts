/**
 * CORS support for routes that bypass the Hono router (e.g. `/agents/...`
 * handled directly by `routeAgentRequest`).
 *
 * Reflects the `Origin` header so the credentialed `useAgentChat` fetch from
 * the dashboard works in dev without forcing a wildcard. The Hono router
 * applies its own `cors()` middleware for all other routes.
 */

const DEFAULT_ALLOWED_HEADERS =
  "authorization,content-type,x-requested-with,x-partykit-room";

const DEFAULT_ALLOWED_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";

export const buildCorsHeaders = (origin: string | null): Headers => {
  const headers = new Headers();

  headers.set("access-control-allow-origin", origin ?? "*");
  headers.set("access-control-allow-credentials", "true");
  headers.set("access-control-allow-headers", DEFAULT_ALLOWED_HEADERS);
  headers.set("access-control-allow-methods", DEFAULT_ALLOWED_METHODS);
  headers.set("access-control-max-age", "600");
  headers.set("vary", "Origin");

  return headers;
};

export const handlePreflight = (request: Request): Response | undefined => {
  if (request.method !== "OPTIONS") {
    return;
  }

  const headers = buildCorsHeaders(request.headers.get("origin"));
  const requestedHeaders = request.headers.get(
    "access-control-request-headers"
  );

  if (requestedHeaders) {
    headers.set("access-control-allow-headers", requestedHeaders);
  }

  return new Response(null, { headers, status: 204 });
};

export const withCorsHeaders = (
  response: Response,
  origin: string | null
): Response => {
  const headers = new Headers(response.headers);
  const cors = buildCorsHeaders(origin);

  cors.forEach((value, name) => {
    headers.set(name, value);
  });

  if (response.webSocket) {
    return new Response(null, {
      headers,
      status: response.status,
      statusText: response.statusText,
      webSocket: response.webSocket,
    });
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};
