import type {
  BenchmarkRunActionResponse,
  BenchmarkRunDetailResponse,
  CreateBenchmarkRunRequest,
  CreateBenchmarkRunResponse,
  CreateCveFollowupRequest,
  CveFollowupDetailResponse,
  CveFollowupStageKind,
  ListBenchmarkRunsResponse,
  ListBenchmarkTasksResponse,
} from "@codebreaker/benchmark-runner/schemas";
import { trimTrailingSlash } from "@codebreaker/shared/lib/utils";

export interface BenchmarkApiClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  token?: string;
}

export class BenchmarkApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly token: string | undefined;

  constructor(options: BenchmarkApiClientOptions) {
    this.baseUrl = trimTrailingSlash(options.baseUrl);
    this.fetchImpl = options.fetch ?? fetch;
    this.token = options.token;
  }

  listTasks(): Promise<ListBenchmarkTasksResponse> {
    return this.request("/benchmark-tasks");
  }

  listRuns(): Promise<ListBenchmarkRunsResponse> {
    return this.request("/benchmark-runs");
  }

  createRun(
    body: CreateBenchmarkRunRequest
  ): Promise<CreateBenchmarkRunResponse> {
    return this.request("/benchmark-runs", {
      body: JSON.stringify(body),
      method: "POST",
    });
  }

  getRun(id: string): Promise<BenchmarkRunDetailResponse> {
    return this.request(`/benchmark-runs/${encodeURIComponent(id)}`);
  }

  startRun(id: string): Promise<BenchmarkRunActionResponse> {
    return this.request(`/benchmark-runs/${encodeURIComponent(id)}/start`, {
      method: "POST",
    });
  }

  cancelRun(id: string): Promise<BenchmarkRunActionResponse> {
    return this.request(`/benchmark-runs/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
    });
  }

  cleanupRun(id: string): Promise<BenchmarkRunActionResponse> {
    return this.request(`/benchmark-runs/${encodeURIComponent(id)}/cleanup`, {
      method: "POST",
    });
  }

  getCveFollowup(runId: string): Promise<CveFollowupDetailResponse> {
    return this.request(
      `/benchmark-runs/${encodeURIComponent(runId)}/followup`
    );
  }

  createCveFollowup(
    runId: string,
    body: CreateCveFollowupRequest = { force: false }
  ): Promise<CveFollowupDetailResponse> {
    return this.request(
      `/benchmark-runs/${encodeURIComponent(runId)}/followup`,
      {
        body: JSON.stringify(body),
        method: "POST",
      }
    );
  }

  cancelCveFollowup(runId: string): Promise<CveFollowupDetailResponse> {
    return this.request(
      `/benchmark-runs/${encodeURIComponent(runId)}/followup/cancel`,
      { method: "POST" }
    );
  }

  retryCveFollowupStage(
    runId: string,
    kind: CveFollowupStageKind
  ): Promise<CveFollowupDetailResponse> {
    return this.request(
      `/benchmark-runs/${encodeURIComponent(runId)}/followup/stages/${encodeURIComponent(kind)}/retry`,
      { method: "POST" }
    );
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);

    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return (await response.json()) as T;
  }
}
