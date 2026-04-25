import type {
  CreateSessionRequest,
  CreateSessionResponse,
  InspectExecRequest,
  InspectExecResponse,
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
