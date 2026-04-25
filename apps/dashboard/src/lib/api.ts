import type {
  AdminShimHealthResponse,
  AdminShimSandboxesResponse,
  ApiError,
  CreateSessionRequest,
  CreateSessionResponse,
  InspectExecRequest,
  InspectExecResponse,
  ListSessionsQuery,
  ListSessionsResponse,
  SessionAgentState,
  SessionConfigResponse,
  SessionDetailResponse,
  SessionMessagesResponse,
  SessionSandboxResponse,
} from "@codebreaker/shared/schemas/api";
import { connectionStore } from "./connection";

export class ApiClientError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(payload: ApiError, status: number) {
    super(payload.message);
    this.name = "ApiClientError";
    this.code = payload.code;
    this.status = status;
    this.details = payload.details;
  }
}

const buildUrl = (path: string, query?: Record<string, unknown>): string => {
  const { baseUrl } = connectionStore.get();
  const url = new URL(path, `${baseUrl}/`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
};

const buildHeaders = (init?: HeadersInit): Headers => {
  const headers = new Headers(init);
  const { token } = connectionStore.get();

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return headers;
};

const parseError = async (response: Response): Promise<ApiClientError> => {
  let payload: ApiError = {
    code: "request_failed",
    message: `Request failed with ${response.status}`,
  };

  try {
    const body = (await response.json()) as Partial<ApiError>;

    if (
      body &&
      typeof body.message === "string" &&
      typeof body.code === "string"
    ) {
      payload = {
        code: body.code,
        details: body.details,
        message: body.message,
      };
    }
  } catch {
    // ignore
  }

  return new ApiClientError(payload, response.status);
};

const request = async <T>(
  path: string,
  init: RequestInit = {},
  query?: Record<string, unknown>
): Promise<T> => {
  const response = await fetch(buildUrl(path, query), {
    ...init,
    headers: buildHeaders(init.headers),
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
};

export const api = {
  health: (): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>("/health", {
      headers: { authorization: "" },
    }),

  listSessions: (
    query: Partial<ListSessionsQuery> = {}
  ): Promise<ListSessionsResponse> =>
    request<ListSessionsResponse>(
      "/sessions",
      {},
      query as Record<string, unknown>
    ),

  getSession: (id: string): Promise<SessionDetailResponse> =>
    request<SessionDetailResponse>(`/sessions/${encodeURIComponent(id)}`),

  createSession: (body: CreateSessionRequest): Promise<CreateSessionResponse> =>
    request<CreateSessionResponse>("/sessions", {
      body: JSON.stringify(body),
      method: "POST",
    }),

  archiveSession: (id: string): Promise<{ ok: boolean }> =>
    request<{ ok: boolean }>(`/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),

  getMessages: (id: string): Promise<SessionMessagesResponse> =>
    request<SessionMessagesResponse>(
      `/sessions/${encodeURIComponent(id)}/messages`
    ),

  getConfig: (id: string): Promise<SessionConfigResponse> =>
    request<SessionConfigResponse>(
      `/sessions/${encodeURIComponent(id)}/config`
    ),

  getState: (id: string): Promise<{ state: SessionAgentState }> =>
    request<{ state: SessionAgentState }>(
      `/sessions/${encodeURIComponent(id)}/state`
    ),

  getSandbox: (id: string): Promise<SessionSandboxResponse> =>
    request<SessionSandboxResponse>(
      `/sessions/${encodeURIComponent(id)}/sandbox`
    ),

  execSandbox: (
    id: string,
    body: InspectExecRequest
  ): Promise<InspectExecResponse> =>
    request<InspectExecResponse>(
      `/sessions/${encodeURIComponent(id)}/sandbox/exec`,
      {
        body: JSON.stringify(body),
        method: "POST",
      }
    ),

  shimHealth: (): Promise<AdminShimHealthResponse> =>
    request<AdminShimHealthResponse>("/admin/shim/health"),

  shimSandboxes: (): Promise<AdminShimSandboxesResponse> =>
    request<AdminShimSandboxesResponse>("/admin/shim/sandboxes"),
};

export type Api = typeof api;
