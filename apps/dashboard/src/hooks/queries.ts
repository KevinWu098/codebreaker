import type {
  BenchmarkRunDetailResponse,
  ListBenchmarkRunsResponse,
  ListBenchmarkTasksResponse,
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
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { ApiClientError, api } from "@/lib/api";
import { isAuthorized, useConnection } from "@/lib/connection";
import { qk } from "@/lib/query-keys";

export const useSessionsQuery = (
  query: Partial<ListSessionsQuery> = {}
): UseQueryResult<ListSessionsResponse, Error> => {
  const connection = useConnection();

  return useQuery({
    enabled: isAuthorized(connection),
    queryFn: () => api.listSessions(query),
    queryKey: [...qk.sessions(connection), query],
    refetchInterval: 5000,
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
    refetchInterval: 30_000,
  });
};

export const useBenchmarkRunsQuery = (): UseQueryResult<
  ListBenchmarkRunsResponse,
  Error
> => {
  const connection = useConnection();

  return useQuery({
    enabled: isAuthorized(connection),
    queryFn: () => api.listBenchmarkRuns(),
    queryKey: qk.benchmarkRuns(connection),
    refetchInterval: 5000,
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
    refetchInterval: 5000,
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
    refetchInterval: 4000,
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
    refetchInterval: 4000,
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
    refetchInterval: 5000,
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
    refetchInterval: 5000,
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
    refetchInterval: 5000,
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
    refetchInterval: 10_000,
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
    refetchInterval: 8000,
  });
};

export const useHealthProbe = (): UseQueryResult<{ ok: boolean }, Error> => {
  const connection = useConnection();

  return useQuery({
    queryFn: () => api.health(),
    queryKey: qk.health(connection),
    refetchInterval: 10_000,
    retry: (failureCount, error) => {
      // Treat 401 as "reachable but locked"; don't burn retries on it.
      if (error instanceof ApiClientError && error.status === 401) {
        return false;
      }

      return failureCount < 1;
    },
  });
};
