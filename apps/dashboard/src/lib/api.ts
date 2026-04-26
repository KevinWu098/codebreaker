import type {
  BenchmarkRunActionResponse,
  BenchmarkRunDetailResponse,
  CreateBenchmarkRunRequest,
  CreateBenchmarkRunResponse,
  CreateCveFollowupRequest,
  CveFollowupDetailResponse,
  CveFollowupStageKind,
  ListBenchmarkRunsQuery,
  ListBenchmarkRunsResponse,
  ListBenchmarkTasksResponse,
  ListCveFollowupsResponse,
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
  FinalizeSessionRequest,
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
import type {
  AuditActionResponse,
  AuditDetailResponse,
  CreateAuditRequest,
  FindingActionResponse,
  ListAuditsQuery,
  ListAuditsResponse,
  ListFindingsQuery,
  ListFindingsResponse,
} from "@codebreaker/shared/schemas/audits";
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

  listBenchmarkRuns: (
    query: Partial<ListBenchmarkRunsQuery> = {}
  ): Promise<ListBenchmarkRunsResponse> => {
    const params: Record<string, unknown> = {};
    if (query.limit !== undefined) {
      params.limit = query.limit;
    }
    if (query.offset !== undefined) {
      params.offset = query.offset;
    }
    if (query.taskId) {
      params.taskId = query.taskId;
    }
    if (query.difficulty) {
      params.difficulty = query.difficulty;
    }
    if (query.modelId) {
      params.modelId = query.modelId;
    }
    if (query.status) {
      params.status = query.status;
    }
    return request<ListBenchmarkRunsResponse>("/benchmark-runs", {}, params);
  },

  listCveFollowups: (limit?: number): Promise<ListCveFollowupsResponse> =>
    request<ListCveFollowupsResponse>(
      "/cve-followups",
      {},
      limit === undefined ? undefined : { limit }
    ),

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

  startBenchmarkRun: (id: string): Promise<BenchmarkRunActionResponse> =>
    request<BenchmarkRunActionResponse>(
      `/benchmark-runs/${encodeURIComponent(id)}/start`,
      {
        method: "POST",
      }
    ),

  cancelBenchmarkRun: (id: string): Promise<BenchmarkRunActionResponse> =>
    request<BenchmarkRunActionResponse>(
      `/benchmark-runs/${encodeURIComponent(id)}/cancel`,
      {
        method: "POST",
      }
    ),

  cleanupBenchmarkRun: (id: string): Promise<BenchmarkRunActionResponse> =>
    request<BenchmarkRunActionResponse>(
      `/benchmark-runs/${encodeURIComponent(id)}/cleanup`,
      {
        method: "POST",
      }
    ),

  getCveFollowup: async (
    runId: string
  ): Promise<CveFollowupDetailResponse | null> => {
    try {
      return await request<CveFollowupDetailResponse>(
        `/benchmark-runs/${encodeURIComponent(runId)}/followup`
      );
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        return null;
      }
      throw error;
    }
  },

  createCveFollowup: (
    runId: string,
    body: CreateCveFollowupRequest = { force: false }
  ): Promise<CveFollowupDetailResponse> =>
    request<CveFollowupDetailResponse>(
      `/benchmark-runs/${encodeURIComponent(runId)}/followup`,
      {
        body: JSON.stringify(body),
        method: "POST",
      }
    ),

  cancelCveFollowup: (runId: string): Promise<CveFollowupDetailResponse> =>
    request<CveFollowupDetailResponse>(
      `/benchmark-runs/${encodeURIComponent(runId)}/followup/cancel`,
      { method: "POST" }
    ),

  retryCveFollowupStage: (
    runId: string,
    kind: CveFollowupStageKind
  ): Promise<CveFollowupDetailResponse> =>
    request<CveFollowupDetailResponse>(
      `/benchmark-runs/${encodeURIComponent(runId)}/followup/stages/${encodeURIComponent(
        kind
      )}/retry`,
      { method: "POST" }
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

  finalizeSession: (
    id: string,
    body: FinalizeSessionRequest = {}
  ): Promise<{ result: unknown }> =>
    request<{ result: unknown }>(
      `/sessions/${encodeURIComponent(id)}/finalize`,
      {
        body: JSON.stringify(body),
        method: "POST",
      }
    ),

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

  listAudits: (
    query: Partial<ListAuditsQuery> = {}
  ): Promise<ListAuditsResponse> =>
    request<ListAuditsResponse>(
      "/audits",
      {},
      query as Record<string, unknown>
    ),

  createAudit: (
    body: CreateAuditRequest
  ): Promise<{ audit: AuditActionResponse["audit"] }> =>
    request<{ audit: AuditActionResponse["audit"] }>("/audits", {
      body: JSON.stringify(body),
      method: "POST",
    }),

  getAudit: (id: string): Promise<AuditDetailResponse> =>
    request<AuditDetailResponse>(`/audits/${encodeURIComponent(id)}`),

  listAuditFindings: (
    id: string,
    query: Partial<ListFindingsQuery> = {}
  ): Promise<ListFindingsResponse> =>
    request<ListFindingsResponse>(
      `/audits/${encodeURIComponent(id)}/findings`,
      {},
      query as Record<string, unknown>
    ),

  cancelAudit: (id: string): Promise<AuditActionResponse> =>
    request<AuditActionResponse>(`/audits/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
    }),

  cleanupAudit: (id: string): Promise<AuditActionResponse> =>
    request<AuditActionResponse>(`/audits/${encodeURIComponent(id)}/cleanup`, {
      method: "POST",
    }),

  dismissAuditFinding: (
    auditId: string,
    findingId: string,
    notes: string
  ): Promise<FindingActionResponse> =>
    request<FindingActionResponse>(
      `/audits/${encodeURIComponent(auditId)}/findings/${encodeURIComponent(
        findingId
      )}/dismiss`,
      {
        body: JSON.stringify({ notes }),
        method: "POST",
      }
    ),

  shimHealth: (): Promise<AdminShimHealthResponse> =>
    request<AdminShimHealthResponse>("/admin/shim/health"),

  shimSandboxes: (): Promise<AdminShimSandboxesResponse> =>
    request<AdminShimSandboxesResponse>("/admin/shim/sandboxes"),
};

export type Api = typeof api;
