import {
  getBenchmarkRunIdFromSessionId,
  isBenchmarkHarnessSession,
  truncateId,
} from "@codebreaker/shared/lib/utils";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { ListPagination } from "@/components/list-pagination";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { Spinner } from "@/components/spinner";
import { CreateSessionDialog } from "@/features/sessions/create-session-dialog";
import { useSessionsQuery } from "@/hooks/queries";
import { isAuthorized, useConnection } from "@/lib/connection";
import { formatNumber, formatRelativeTime, formatRepo } from "@/lib/format";
import { DASHBOARD_LIST_PAGE_SIZE } from "@/lib/list-page-size";

const formatSessionRepo = (session: {
  repoName: string | null;
  repoOwner: string | null;
  runRepoName: string | null;
  targetRepoName: string | null;
}): string => {
  if (session.repoName || session.repoOwner) {
    return formatRepo(session.repoOwner, session.repoName);
  }

  return session.runRepoName ?? session.targetRepoName ?? "—";
};

interface SessionsListProps {
  onOpenBenchmarkRun?: (runId: string) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}

export const SessionsList = ({
  onOpenBenchmarkRun,
  onSelect,
  selectedId,
}: SessionsListProps): React.JSX.Element => {
  const connection = useConnection();
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(0);
  const enabled = isAuthorized(connection);

  const sessions = useSessionsQuery({
    limit: DASHBOARD_LIST_PAGE_SIZE,
    offset: page * DASHBOARD_LIST_PAGE_SIZE,
  });
  const rows = sessions.data?.sessions ?? [];
  const total = sessions.data?.total ?? 0;

  useEffect(() => {
    if (!enabled || sessions.isPending) {
      return;
    }
    if (page > 0 && total > 0 && page * DASHBOARD_LIST_PAGE_SIZE >= total) {
      setPage(0);
    }
  }, [enabled, page, sessions.isPending, total]);

  return (
    <div className="space-y-4">
      <PageHeader
        actions={
          <>
            <RefreshButton
              disabled={!enabled}
              loading={sessions.isFetching}
              onClick={() => sessions.refetch()}
            />
            <Button
              disabled={!enabled}
              onClick={() => setShowCreate(true)}
              variant="primary"
            >
              <Plus aria-hidden="true" size={12} />
              <span>new session</span>
            </Button>
          </>
        }
        description="every row maps to a d1 row + a session-agent durable object."
        title="sessions"
      />

      {!enabled && (
        <EmptyState
          hint="set a jwt in the sidebar to load sessions."
          title="no token configured"
        />
      )}

      <ErrorState error={sessions.error} title="list failed" />

      {enabled && sessions.isPending && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}

      {enabled && sessions.data && total === 0 && !sessions.isPending && (
        <EmptyState
          action={
            <Button onClick={() => setShowCreate(true)} variant="primary">
              create your first session
            </Button>
          }
          hint="d1 returned zero rows."
          title="no sessions yet"
        />
      )}

      {rows.length > 0 && (
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>id</th>
                <th>title</th>
                <th>task</th>
                <th>status</th>
                <th>model</th>
                <th>repo</th>
                <th className="num">turns</th>
                <th className="num">tokens</th>
                <th className="w-28 whitespace-nowrap">updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((session) => {
                const tokens = session.inputTokens + session.outputTokens;
                const repo = formatSessionRepo(session);
                const benchmarkRunId = getBenchmarkRunIdFromSessionId(
                  session.id
                );
                const harness = isBenchmarkHarnessSession(session.id);

                return (
                  <tr
                    aria-selected={session.id === selectedId}
                    className={
                      session.id === selectedId ? "bg-bg-hover" : undefined
                    }
                    key={session.id}
                  >
                    <td>
                      <button
                        className="id-link block max-w-28 truncate whitespace-nowrap"
                        onClick={() => onSelect(session.id)}
                        title={session.id}
                        type="button"
                      >
                        {truncateId(session.id)}
                      </button>
                    </td>
                    <td className="truncate">{session.title ?? "—"}</td>
                    <td className="max-w-36">
                      <div className="flex flex-col gap-0.5 font-mono text-fg-muted text-xs">
                        <span
                          className="truncate"
                          title={session.benchmarkId ?? undefined}
                        >
                          {session.benchmarkId ?? "—"}
                        </span>
                        {harness && benchmarkRunId && onOpenBenchmarkRun ? (
                          <button
                            className="id-link w-fit truncate text-left"
                            onClick={(event) => {
                              event.stopPropagation();
                              onOpenBenchmarkRun(benchmarkRunId);
                            }}
                            title={`open benchmark run ${benchmarkRunId}`}
                            type="button"
                          >
                            run {benchmarkRunId.slice(0, 8)}
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <Badge status={session.status} />
                    </td>
                    <td className="font-mono text-fg-muted">
                      {session.modelProvider}/{session.modelId}
                    </td>
                    <td className="font-mono text-fg-muted">{repo}</td>
                    <td className="num">{formatNumber(session.turnCount)}</td>
                    <td className="num dim">{formatNumber(tokens)}</td>
                    <td
                      className="whitespace-nowrap text-fg-muted"
                      title={new Date(session.updatedAt).toISOString()}
                    >
                      {formatRelativeTime(session.updatedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {enabled && total > 0 && !sessions.isPending && (
        <ListPagination
          isFetching={sessions.isFetching}
          itemCount={rows.length}
          onNext={() => setPage((p) => p + 1)}
          onPrevious={() => setPage((p) => Math.max(0, p - 1))}
          page={page}
          pageSize={DASHBOARD_LIST_PAGE_SIZE}
          total={total}
        />
      )}

      {showCreate && (
        <CreateSessionDialog
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            onSelect(id);
          }}
        />
      )}
    </div>
  );
};
