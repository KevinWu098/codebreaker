import type {
  BenchmarkRunActionResponse,
  CreateBenchmarkRunRequest,
  CreateBenchmarkRunResponse,
} from "@codebreaker/benchmark-runner/schemas";
import type {
  ArtifactCheckoutRequest,
  ArtifactCheckoutResponse,
  ArtifactCommitRequest,
  ArtifactCommitResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  InspectExecRequest,
  InspectExecResponse,
  SessionArtifactResponse,
  UpdateArtifactStateRequest,
} from "@codebreaker/shared/schemas/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiClientError, api } from "@/lib/api";
import { useConnection } from "@/lib/connection";
import { qk } from "@/lib/query-keys";

const messageFor = (error: unknown, fallback: string): string => {
  if (error instanceof ApiClientError) {
    return `${fallback}: ${error.message}`;
  }

  if (error instanceof Error) {
    return `${fallback}: ${error.message}`;
  }

  return fallback;
};

export const useCreateSessionMutation = () => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<CreateSessionResponse, Error, CreateSessionRequest>({
    mutationFn: (body) => api.createSession(body),
    onError: (error) => {
      toast.error(messageFor(error, "create failed"));
    },
    onSuccess: (response) => {
      toast.success(`session ${response.session.id.slice(0, 8)}… created`);
      queryClient.invalidateQueries({ queryKey: qk.sessions(connection) });
    },
  });
};

export const useCreateBenchmarkRunMutation = () => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<
    CreateBenchmarkRunResponse,
    Error,
    CreateBenchmarkRunRequest
  >({
    mutationFn: (body) => api.createBenchmarkRun(body),
    onError: (error) => {
      toast.error(messageFor(error, "benchmark run failed"));
    },
    onSuccess: (response) => {
      toast.success(`benchmark ${response.run.id.slice(0, 8)}… started`);
      queryClient.invalidateQueries({ queryKey: qk.benchmarkRuns(connection) });
    },
  });
};

export const useCleanupBenchmarkRunMutation = (runId: string) => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<BenchmarkRunActionResponse, Error, void>({
    mutationFn: () => api.cleanupBenchmarkRun(runId),
    onError: (error) => {
      toast.error(messageFor(error, "benchmark cleanup failed"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.benchmarkRuns(connection) });
      queryClient.invalidateQueries({
        queryKey: qk.benchmarkRun(connection, runId),
      });
    },
  });
};

export const useArchiveSessionMutation = (sessionId: string) => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<{ ok: boolean }, Error, void>({
    mutationFn: () => api.archiveSession(sessionId),
    onError: (error) => {
      toast.error(messageFor(error, "archive failed"));
    },
    onSuccess: () => {
      toast.success(`session ${sessionId.slice(0, 8)}… archived`);
      queryClient.invalidateQueries({ queryKey: qk.sessions(connection) });
      queryClient.invalidateQueries({
        queryKey: qk.session.detail(connection, sessionId),
      });
    },
  });
};

export const useExecSandboxMutation = (sessionId: string) => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<InspectExecResponse, Error, InspectExecRequest>({
    mutationFn: (body) => api.execSandbox(sessionId, body),
    onError: (error) => {
      toast.error(messageFor(error, "exec failed"));
    },
    onSuccess: (response) => {
      if (response.result.timedOut) {
        toast.warning("command timed out");
      } else if (response.result.exitCode !== 0) {
        toast.warning(`exit ${response.result.exitCode}`);
      }

      queryClient.invalidateQueries({
        queryKey: qk.session.sandbox(connection, sessionId),
      });
    },
  });
};

export const useCheckoutArtifactsMutation = (sessionId: string) => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<ArtifactCheckoutResponse, Error, ArtifactCheckoutRequest>({
    mutationFn: (body) => api.checkoutArtifacts(sessionId, body),
    onError: (error) => {
      toast.error(messageFor(error, "artifact checkout failed"));
    },
    onSuccess: (response) => {
      toast.success(`checked out ${response.result.repoPath}`);
      queryClient.invalidateQueries({
        queryKey: qk.session.artifacts(connection, sessionId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.session.state(connection, sessionId),
      });
    },
  });
};

export const useCommitArtifactsMutation = (sessionId: string) => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<ArtifactCommitResponse, Error, ArtifactCommitRequest>({
    mutationFn: (body) => api.commitArtifacts(sessionId, body),
    onError: (error) => {
      toast.error(messageFor(error, "artifact commit failed"));
    },
    onSuccess: (response) => {
      toast.success(
        response.result.pushed
          ? "artifact commit pushed"
          : "no artifact changes"
      );
      queryClient.invalidateQueries({
        queryKey: qk.session.artifacts(connection, sessionId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.session.state(connection, sessionId),
      });
    },
  });
};

export const useUpdateArtifactsMutation = (sessionId: string) => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<
    SessionArtifactResponse,
    Error,
    UpdateArtifactStateRequest
  >({
    mutationFn: (body) => api.updateArtifacts(sessionId, body),
    onError: (error) => {
      toast.error(messageFor(error, "artifact update failed"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: qk.session.artifacts(connection, sessionId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.session.state(connection, sessionId),
      });
    },
  });
};
