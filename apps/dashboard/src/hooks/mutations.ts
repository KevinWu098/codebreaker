import type {
  BenchmarkRunActionResponse,
  BenchmarkRunDetailResponse,
  CreateBenchmarkRunRequest,
  CreateBenchmarkRunResponse,
  CreateCveFollowupRequest,
  CveFollowupDetailResponse,
  CveFollowupStageKind,
  ListBenchmarkRunsResponse,
} from "@codebreaker/benchmark-runner/schemas";
import type {
  ArtifactCheckoutRequest,
  ArtifactCheckoutResponse,
  ArtifactCommitRequest,
  ArtifactCommitResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  FinalizeSessionRequest,
  InspectExecRequest,
  InspectExecResponse,
  SessionArtifactResponse,
  UpdateArtifactStateRequest,
} from "@codebreaker/shared/schemas/api";
import type {
  AuditActionResponse,
  AuditRow,
  CreateAuditRequest,
  FindingActionResponse,
} from "@codebreaker/shared/schemas/audits";
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

const benchmarkRunUrl = (runId: string): string => {
  const url = new URL(window.location.href);
  url.searchParams.set("view", "benchmarks");
  url.searchParams.set("benchmark", runId);
  url.searchParams.set("tab", "results");
  url.searchParams.delete("followupRun");
  url.searchParams.delete("session");
  return `${url.pathname}${url.search}${url.hash}`;
};

const replaceBenchmarkRun = (
  data: ListBenchmarkRunsResponse | undefined,
  response: BenchmarkRunActionResponse
): ListBenchmarkRunsResponse | undefined => {
  if (!data) {
    return data;
  }

  return {
    ...data,
    runs: data.runs.map((run) =>
      run.id === response.run.id ? response.run : run
    ),
  };
};

const replaceBenchmarkRunDetail = (
  data: BenchmarkRunDetailResponse | undefined,
  response: BenchmarkRunActionResponse
): BenchmarkRunDetailResponse | undefined => {
  if (!data) {
    return data;
  }

  return {
    ...data,
    run: response.run,
  };
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
      toast.success(`benchmark ${response.run.id.slice(0, 8)}… started`, {
        action: {
          label: "open",
          onClick: () => {
            window.location.assign(benchmarkRunUrl(response.run.id));
          },
        },
      });
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

export const useCancelBenchmarkRunMutation = (runId: string) => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<BenchmarkRunActionResponse, Error, void>({
    mutationFn: () => api.cancelBenchmarkRun(runId),
    onError: (error) => {
      toast.error(messageFor(error, "benchmark stop failed"));
    },
    onSuccess: (response) => {
      toast.success(`benchmark ${runId.slice(0, 8)}… stopped`);
      queryClient.setQueriesData<ListBenchmarkRunsResponse>(
        { queryKey: qk.benchmarkRuns(connection) },
        (data) => replaceBenchmarkRun(data, response)
      );
      queryClient.setQueryData<BenchmarkRunDetailResponse>(
        qk.benchmarkRun(connection, runId),
        (data) => replaceBenchmarkRunDetail(data, response)
      );
      queryClient.invalidateQueries({ queryKey: qk.benchmarkRuns(connection) });
      queryClient.invalidateQueries({
        queryKey: qk.benchmarkRun(connection, runId),
      });
    },
  });
};

export const useStartBenchmarkRunMutation = (runId: string) => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<BenchmarkRunActionResponse, Error, void>({
    mutationFn: () => api.startBenchmarkRun(runId),
    onError: (error) => {
      toast.error(messageFor(error, "benchmark start failed"));
    },
    onSuccess: () => {
      toast.success(`benchmark ${runId.slice(0, 8)}… started`);
      queryClient.invalidateQueries({ queryKey: qk.benchmarkRuns(connection) });
      queryClient.invalidateQueries({
        queryKey: qk.benchmarkRun(connection, runId),
      });
    },
  });
};

export const useCreateCveFollowupMutation = (runId: string) => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<
    CveFollowupDetailResponse,
    Error,
    CreateCveFollowupRequest | undefined
  >({
    mutationFn: (body) =>
      api.createCveFollowup(runId, body ?? { force: false }),
    onError: (error) => {
      toast.error(messageFor(error, "CVE follow-up failed"));
    },
    onSuccess: () => {
      toast.success("CVE follow-up created");
      queryClient.invalidateQueries({
        queryKey: qk.cveFollowup(connection, runId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.cveFollowupsList(connection),
      });
      queryClient.invalidateQueries({
        queryKey: qk.benchmarkRun(connection, runId),
      });
    },
  });
};

export const useCancelCveFollowupMutation = (runId: string) => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<CveFollowupDetailResponse, Error, void>({
    mutationFn: () => api.cancelCveFollowup(runId),
    onError: (error) => {
      toast.error(messageFor(error, "CVE follow-up cancel failed"));
    },
    onSuccess: () => {
      toast.success("CVE follow-up cancelled");
      queryClient.invalidateQueries({
        queryKey: qk.cveFollowup(connection, runId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.cveFollowupsList(connection),
      });
      queryClient.invalidateQueries({
        queryKey: qk.benchmarkRun(connection, runId),
      });
    },
  });
};

export const useRetryCveFollowupStageMutation = (runId: string) => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<CveFollowupDetailResponse, Error, CveFollowupStageKind>({
    mutationFn: (kind) => api.retryCveFollowupStage(runId, kind),
    onError: (error) => {
      toast.error(messageFor(error, "stage retry failed"));
    },
    onSuccess: () => {
      toast.success("stage queued for retry");
      queryClient.invalidateQueries({
        queryKey: qk.cveFollowup(connection, runId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.cveFollowupsList(connection),
      });
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

export const useFinalizeSessionMutation = (sessionId: string) => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<{ result: unknown }, Error, FinalizeSessionRequest>({
    mutationFn: (body) => api.finalizeSession(sessionId, body),
    onError: (error) => {
      toast.error(messageFor(error, "finalize failed"));
    },
    onSuccess: () => {
      toast.success(`session ${sessionId.slice(0, 8)}… finalizing`);
      queryClient.invalidateQueries({
        queryKey: qk.session.detail(connection, sessionId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.session.messages(connection, sessionId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.session.state(connection, sessionId),
      });
      queryClient.invalidateQueries({ queryKey: qk.sessions(connection) });
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

const auditUrl = (auditId: string): string => {
  const url = new URL(window.location.href);
  url.searchParams.set("view", "audits");
  url.searchParams.set("audit", auditId);
  url.searchParams.delete("finding");
  return `${url.pathname}${url.search}${url.hash}`;
};

export const useCreateAuditMutation = () => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<{ audit: AuditRow }, Error, CreateAuditRequest>({
    mutationFn: (body) => api.createAudit(body),
    onError: (error) => {
      toast.error(messageFor(error, "audit failed"));
    },
    onSuccess: (response) => {
      toast.success(`audit ${response.audit.id.slice(0, 8)}… started`, {
        action: {
          label: "open",
          onClick: () => {
            window.location.assign(auditUrl(response.audit.id));
          },
        },
      });
      queryClient.invalidateQueries({ queryKey: qk.audits(connection) });
    },
  });
};

export const useCancelAuditMutation = (auditId: string) => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<AuditActionResponse, Error, void>({
    mutationFn: () => api.cancelAudit(auditId),
    onError: (error) => {
      toast.error(messageFor(error, "audit cancel failed"));
    },
    onSuccess: () => {
      toast.success(`audit ${auditId.slice(0, 8)}… cancelled`);
      queryClient.invalidateQueries({ queryKey: qk.audits(connection) });
      queryClient.invalidateQueries({
        queryKey: qk.audit(connection, auditId),
      });
    },
  });
};

export const useCleanupAuditMutation = (auditId: string) => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<AuditActionResponse, Error, void>({
    mutationFn: () => api.cleanupAudit(auditId),
    onError: (error) => {
      toast.error(messageFor(error, "audit cleanup failed"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.audits(connection) });
      queryClient.invalidateQueries({
        queryKey: qk.audit(connection, auditId),
      });
    },
  });
};

export const useDismissFindingMutation = (auditId: string) => {
  const connection = useConnection();
  const queryClient = useQueryClient();

  return useMutation<
    FindingActionResponse,
    Error,
    { findingId: string; notes: string }
  >({
    mutationFn: ({ findingId, notes }) =>
      api.dismissAuditFinding(auditId, findingId, notes),
    onError: (error) => {
      toast.error(messageFor(error, "finding dismiss failed"));
    },
    onSuccess: () => {
      toast.success("finding dismissed");
      queryClient.invalidateQueries({
        queryKey: qk.audit(connection, auditId),
      });
      queryClient.invalidateQueries({
        queryKey: qk.auditFindings(connection, auditId),
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
