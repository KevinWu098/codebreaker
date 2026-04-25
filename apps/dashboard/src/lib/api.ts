import type {
  BenchmarkRunActionResponse,
  BenchmarkRunDetailResponse,
  CreateBenchmarkRunRequest,
  CreateBenchmarkRunResponse,
  ListBenchmarkRunsResponse,
  ListBenchmarkTasksResponse,
} from "@codebreaker/benchmark-runner/schemas";
import type {
  AdminShimHealthResponse,
  AdminShimSandboxesResponse,
  ApiError,
  ArtifactCheckoutRequest,
  ArtifactCheckoutResponse,
  ArtifactCommitRequest,
  ArtifactCommitResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  InspectExecRequest,
  InspectExecResponse,
  ListSessionsQuery,
  ListSessionsResponse,
  SessionArtifactResponse,
  SessionConfigResponse,
  SessionDetailResponse,
  SessionMessagesResponse,
  SessionSandboxResponse,
  SessionStateResponse,
  UpdateArtifactStateRequest,
} from "@codebreaker/shared/schemas/api";
import { connectionStore } from "@/lib/connection";

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

  listBenchmarkTasks: (): Promise<ListBenchmarkTasksResponse> =>
    request<ListBenchmarkTasksResponse>("/benchmark-tasks"),

  listBenchmarkRuns: (): Promise<ListBenchmarkRunsResponse> =>
    request<ListBenchmarkRunsResponse>("/benchmark-runs"),

  createBenchmarkRun: (
    body: CreateBenchmarkRunRequest
  ): Promise<CreateBenchmarkRunResponse> =>
    request<CreateBenchmarkRunResponse>("/benchmark-runs", {
      body: JSON.stringify(body),
      method: "POST",
    }),

  getBenchmarkRun: (id: string): Promise<BenchmarkRunDetailResponse> =>
    request<BenchmarkRunDetailResponse>(
      `/benchmark-runs/${encodeURIComponent(id)}`
    ),

  cleanupBenchmarkRun: (id: string): Promise<BenchmarkRunActionResponse> =>
    request<BenchmarkRunActionResponse>(
      `/benchmark-runs/${encodeURIComponent(id)}/cleanup`,
      {
        method: "POST",
      }
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

  getState: (id: string): Promise<SessionStateResponse> =>
    request<SessionStateResponse>(`/sessions/${encodeURIComponent(id)}/state`),

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

  getArtifacts: (id: string): Promise<SessionArtifactResponse> =>
    request<SessionArtifactResponse>(
      `/sessions/${encodeURIComponent(id)}/artifacts`
    ),

  updateArtifacts: (
    id: string,
    body: UpdateArtifactStateRequest
  ): Promise<SessionArtifactResponse> =>
    request<SessionArtifactResponse>(
      `/sessions/${encodeURIComponent(id)}/artifacts`,
      {
        body: JSON.stringify(body),
        method: "PATCH",
      }
    ),

  checkoutArtifacts: (
    id: string,
    body: ArtifactCheckoutRequest
  ): Promise<ArtifactCheckoutResponse> =>
    request<ArtifactCheckoutResponse>(
      `/sessions/${encodeURIComponent(id)}/artifacts/checkout`,
      {
        body: JSON.stringify(body),
        method: "POST",
      }
    ),

  commitArtifacts: (
    id: string,
    body: ArtifactCommitRequest
  ): Promise<ArtifactCommitResponse> =>
    request<ArtifactCommitResponse>(
      `/sessions/${encodeURIComponent(id)}/artifacts/commit`,
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
