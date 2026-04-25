import { Plus } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { Spinner } from "@/components/spinner";
import { CreateSessionDialog } from "@/features/sessions/create-session-dialog";
import { useAsync } from "@/hooks/use-async";
import { api } from "@/lib/api";
import { useConnection } from "@/lib/connection";
import { formatNumber, formatRelativeTime, truncateId } from "@/lib/format";

interface SessionsListProps {
  onSelect: (id: string) => void;
  selectedId: string | undefined;
}

export const SessionsList = ({
  onSelect,
  selectedId,
}: SessionsListProps): React.JSX.Element => {
  const connection = useConnection();
  const [showCreate, setShowCreate] = useState(false);
  const enabled = connection.token.length > 0;

  const sessions = useAsync(() => api.listSessions({ limit: 100, offset: 0 }), {
    enabled,
    key: `sessions:${connection.baseUrl}:${connection.token}`,
    pollMs: 5000,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        actions={
          <>
            <RefreshButton
              disabled={!enabled}
              loading={sessions.loading}
              onClick={() => sessions.refresh()}
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

      {enabled && sessions.data && sessions.data.sessions.length === 0 && (
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

      {enabled && !sessions.data && !sessions.error && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}

      {sessions.data && sessions.data.sessions.length > 0 && (
        <div className="card overflow-hidden">
          <table className="table">
            <thead>
              <tr>
                <th>id</th>
                <th>title</th>
                <th>status</th>
                <th>model</th>
                <th>repo</th>
                <th className="num">turns</th>
                <th className="num">tokens</th>
                <th>updated</th>
              </tr>
            </thead>
            <tbody>
              {sessions.data.sessions.map((session) => {
                const tokens = session.inputTokens + session.outputTokens;
                const repo = session.repoOwner
                  ? `${session.repoOwner}/${session.repoName ?? ""}`
                  : (session.repoName ?? "—");

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
                        className="id-link"
                        onClick={() => onSelect(session.id)}
                        title={session.id}
                        type="button"
                      >
                        {truncateId(session.id)}
                      </button>
                    </td>
                    <td className="truncate">{session.title ?? "—"}</td>
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
                      className="text-fg-muted"
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

      {showCreate && (
        <CreateSessionDialog
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            sessions.refresh();
            onSelect(id);
          }}
        />
      )}
    </div>
  );
};
