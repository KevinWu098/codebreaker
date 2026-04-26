import type {
  BenchmarkRunDetailResponse,
  BenchmarkRunRow,
  CveFollowupDetailResponse,
  Difficulty,
  ListBenchmarkRunsQuery,
  ListBenchmarkRunsResponse,
  ListBenchmarkTasksResponse,
  ListCveFollowupsResponse,
} from "@codebreaker/benchmark-runner/schemas";
import type {
  AdminShimHealthResponse,
  AdminShimSandboxesResponse,
  ListSessionsQuery,
  ListSessionsResponse,
  SessionArtifactResponse,
  SessionConfigResponse,
  SessionDetailResponse,
  SessionMessagesResponse,
  SessionSandboxResponse,
  SessionStateResponse,
} from "@codebreaker/shared/schemas/api";
import type {
  AuditDetailResponse,
  ListAuditsQuery,
  ListAuditsResponse,
  ListFindingsQuery,
  ListFindingsResponse,
} from "@codebreaker/shared/schemas/audits";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { ApiClientError, api } from "@/lib/api";
import { isAuthorized, useConnection } from "@/lib/connection";
import { getCveFollowupPollIntervalMs, POLLING } from "@/lib/polling";
import { qk } from "@/lib/query-keys";

export const useSessionsQuery = (
  query: Partial<ListSessionsQuery> = {}
): UseQueryResult<ListSessionsResponse, Error> => {
  const connection = useConnection();

  return useQuery({
    enabled: isAuthorized(connection),
    queryFn: () => api.listSessions(query),
    queryKey: [...qk.sessions(connection), query],
    refetchInterval: POLLING.sessions.list,
  });
};

export const useBenchmarkTasksQuery = (): UseQueryResult<
  ListBenchmarkTasksResponse,
  Error
> => {
  const connection = useConnection();

  return useQuery({
    enabled: isAuthorized(connection),
    queryFn: () => api.listBenchmarkTasks(),
    queryKey: qk.benchmarkTasks(connection),
    refetchInterval: POLLING.benchmarks.tasks,
  });
};

export const useBenchmarkRunsQuery = (
  query: Partial<ListBenchmarkRunsQuery> = {}
): UseQueryResult<ListBenchmarkRunsResponse, Error> => {
  const connection = useConnection();

  return useQuery({
    enabled: isAuthorized(connection),
    queryFn: () => api.listBenchmarkRuns(query),
    queryKey: [...qk.benchmarkRuns(connection), query],
    refetchInterval: POLLING.benchmarks.runs,
  });
};

export const useBenchmarkRunQuery = (
  id: string
): UseQueryResult<BenchmarkRunDetailResponse, Error> => {
  const connection = useConnection();

  return useQuery({
    enabled: isAuthorized(connection),
    queryFn: () => api.getBenchmarkRun(id),
    queryKey: qk.benchmarkRun(connection, id),
    refetchInterval: POLLING.benchmarks.runDetail,
  });
};

export const useCveFollowupQuery = (
  runId: string,
  options?: { enabled?: boolean }
): UseQueryResult<CveFollowupDetailResponse | null, Error> => {
  const connection = useConnection();
  const canFetch = options?.enabled ?? true;

  return useQuery<CveFollowupDetailResponse | null, Error>({
    enabled: isAuthorized(connection) && canFetch,
    queryFn: () => api.getCveFollowup(runId),
    queryKey: qk.cveFollowup(connection, runId),
    refetchInterval: (query) => getCveFollowupPollIntervalMs(query.state.data),
  });
};

export const useCveFollowupsListQuery = (): UseQueryResult<
  ListCveFollowupsResponse,
  Error
> => {
  const connection = useConnection();

  return useQuery({
    enabled: isAuthorized(connection),
    queryFn: () => api.listCveFollowups(200),
    queryKey: qk.cveFollowupsList(connection),
    refetchInterval: POLLING.benchmarks.cveFollowupsList,
  });
};

export const useSessionQuery = (
  id: string
): UseQueryResult<SessionDetailResponse, Error> => {
  const connection = useConnection();

  return useQuery({
    enabled: isAuthorized(connection),
    queryFn: () => api.getSession(id),
    queryKey: qk.session.detail(connection, id),
    refetchInterval: POLLING.sessions.detail,
  });
};

export const useSessionStateQuery = (
  id: string
): UseQueryResult<SessionStateResponse, Error> => {
  const connection = useConnection();

  return useQuery({
    enabled: isAuthorized(connection),
    queryFn: () => api.getState(id),
    queryKey: qk.session.state(connection, id),
    refetchInterval: POLLING.sessions.state,
  });
};

export const useSessionConfigQuery = (
  id: string,
  enabled: boolean
): UseQueryResult<SessionConfigResponse, Error> => {
  const connection = useConnection();

  return useQuery({
    enabled: enabled && isAuthorized(connection),
    queryFn: () => api.getConfig(id),
    queryKey: qk.session.config(connection, id),
  });
};

export const useSessionMessagesQuery = (
  id: string
): UseQueryResult<SessionMessagesResponse, Error> => {
  const connection = useConnection();

  return useQuery({
    enabled: isAuthorized(connection),
    queryFn: () => api.getMessages(id),
    queryKey: qk.session.messages(connection, id),
    refetchInterval: POLLING.sessions.messages,
  });
};

export const useSandboxQuery = (
  id: string
): UseQueryResult<SessionSandboxResponse, Error> => {
  const connection = useConnection();

  return useQuery({
    enabled: isAuthorized(connection),
    queryFn: () => api.getSandbox(id),
    queryKey: qk.session.sandbox(connection, id),
    refetchInterval: POLLING.sessions.sandbox,
  });
};

export const useSessionArtifactsQuery = (
  id: string
): UseQueryResult<SessionArtifactResponse, Error> => {
  const connection = useConnection();

  return useQuery({
    enabled: isAuthorized(connection),
    queryFn: () => api.getArtifacts(id),
    queryKey: qk.session.artifacts(connection, id),
    refetchInterval: POLLING.sessions.artifacts,
  });
};

export const useAuditsQuery = (
  query: Partial<ListAuditsQuery> = {}
): UseQueryResult<ListAuditsResponse, Error> => {
  const connection = useConnection();

  return useQuery({
    enabled: isAuthorized(connection),
    queryFn: () => api.listAudits(query),
    queryKey: [...qk.audits(connection), query],
    refetchInterval: POLLING.audits.list,
  });
};

export const useAuditQuery = (
  id: string,
  options?: { enabled?: boolean }
): UseQueryResult<AuditDetailResponse, Error> => {
  const connection = useConnection();
  const canFetch = options?.enabled ?? true;

  return useQuery({
    enabled: isAuthorized(connection) && canFetch && Boolean(id),
    queryFn: () => api.getAudit(id),
    queryKey: qk.audit(connection, id),
    refetchInterval: POLLING.audits.detail,
  });
};

export const useAuditFindingsQuery = (
  id: string,
  query: Partial<ListFindingsQuery> = {},
  options?: { enabled?: boolean }
): UseQueryResult<ListFindingsResponse, Error> => {
  const connection = useConnection();
  const canFetch = options?.enabled ?? true;

  return useQuery({
    enabled: isAuthorized(connection) && canFetch && Boolean(id),
    queryFn: () => api.listAuditFindings(id, query),
    queryKey: [...qk.auditFindings(connection, id), query],
    refetchInterval: POLLING.audits.findings,
  });
};

export const useShimHealthQuery = (): UseQueryResult<
  AdminShimHealthResponse,
  Error
> => {
  const connection = useConnection();

  return useQuery({
    enabled: isAuthorized(connection),
    queryFn: () => api.shimHealth(),
    queryKey: qk.admin.health(connection),
    refetchInterval: POLLING.admin.health,
  });
};

export const useShimSandboxesQuery = (): UseQueryResult<
  AdminShimSandboxesResponse,
  Error
> => {
  const connection = useConnection();

  return useQuery({
    enabled: isAuthorized(connection),
    queryFn: () => api.shimSandboxes(),
    queryKey: qk.admin.sandboxes(connection),
    refetchInterval: POLLING.admin.sandboxes,
  });
};

export const useHealthProbe = (): UseQueryResult<{ ok: boolean }, Error> => {
  const connection = useConnection();

  return useQuery({
    queryFn: () => api.health(),
    queryKey: qk.health(connection),
    refetchInterval: POLLING.health,
    retry: (failureCount, error) => {
      // Treat 401 as "reachable but locked"; don't burn retries on it.
      if (error instanceof ApiClientError && error.status === 401) {
        return false;
      }

      return failureCount < 1;
    },
  });
};

const fetchAllCompletedRuns = async (
  base: Partial<ListBenchmarkRunsQuery>
): Promise<BenchmarkRunRow[]> => {
  const pageSize = 100;
  const all: BenchmarkRunRow[] = [];
  let offset = 0;

  for (;;) {
    const response = await api.listBenchmarkRuns({
      ...base,
      limit: pageSize,
      offset,
      status: "completed",
    });
    for (const run of response.runs) {
      all.push(run);
    }
    if (all.length >= response.total || response.runs.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return all;
};

export const useComparisonRunsQuery = (filters: {
  difficulty?: Difficulty | undefined;
  taskId?: string | undefined;
}): UseQueryResult<BenchmarkRunRow[], Error> => {
  const connection = useConnection();
  const hasFilters = Boolean(filters.taskId && filters.difficulty);

  return useQuery({
    enabled: isAuthorized(connection) && hasFilters,
    queryFn: () => {
      const query: Partial<ListBenchmarkRunsQuery> = {};
      if (filters.taskId) {
        query.taskId = filters.taskId;
      }
      if (filters.difficulty) {
        query.difficulty = filters.difficulty;
      }
      return fetchAllCompletedRuns(query);
    },
    queryKey: [
      ...qk.benchmarkRuns(connection),
      "compare",
      filters.taskId,
      filters.difficulty,
    ],
    refetchInterval: POLLING.benchmarks.runs,
  });
};

export const useLeaderboardRunsQuery = (filters: {
  difficulty?: Difficulty | undefined;
}): UseQueryResult<BenchmarkRunRow[], Error> => {
  const connection = useConnection();

  return useQuery({
    enabled: isAuthorized(connection),
    queryFn: () => {
      const query: Partial<ListBenchmarkRunsQuery> = {};
      if (filters.difficulty) {
        query.difficulty = filters.difficulty;
      }
      return fetchAllCompletedRuns(query);
    },
    queryKey: [
      ...qk.benchmarkRuns(connection),
      "leaderboard",
      filters.difficulty,
    ],
    refetchInterval: POLLING.benchmarks.runs,
  });
};
