import { useState } from "react";
import { ErrorBanner } from "../../components/error-banner";
import { StatusBadge } from "../../components/status-badge";
import { useAsync } from "../../hooks/use-async";
import { api } from "../../lib/api";
import { useConnection } from "../../lib/connection";
import { formatRelativeTime, truncateId } from "../../lib/format";
import { CreateSessionDialog } from "./create-session-dialog";

interface Props {
  onSelect: (id: string) => void;
  selectedId: string | undefined;
}

export const SessionsList = ({
  selectedId,
  onSelect,
}: Props): React.JSX.Element => {
  const connection = useConnection();
  const [showCreate, setShowCreate] = useState(false);

  const sessions = useAsync(
    () => api.listSessions({ limit: 100, offset: 0 }),
    [connection.baseUrl, connection.token],
    { enabled: connection.token.length > 0, pollMs: 5000 }
  );

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Sessions</h2>
        <div className="flex gap-2">
          <button
            className="btn btn-ghost"
            disabled={!connection.token}
            onClick={() => sessions.refresh()}
            title="Refresh"
            type="button"
          >
            ↻
          </button>
          <button
            className="btn btn-primary"
            disabled={!connection.token}
            onClick={() => setShowCreate(true)}
            type="button"
          >
            + New
          </button>
        </div>
      </div>

      {!connection.token && (
        <div className="empty">
          Set a JWT token in the top bar to load sessions.
        </div>
      )}

      {sessions.error && (
        <div style={{ padding: 10 }}>
          <ErrorBanner error={sessions.error} title="Failed to list sessions" />
        </div>
      )}

      {sessions.data && sessions.data.sessions.length === 0 && (
        <div className="empty">No sessions yet. Click + New.</div>
      )}

      <ul className="sidebar-list">
        {sessions.data?.sessions.map((session) => (
          <li
            className={`row${session.id === selectedId ? "active" : ""}`}
            key={session.id}
            onClick={() => onSelect(session.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onSelect(session.id);
              }
            }}
          >
            <div className="between center flex gap-2">
              <span className="id" title={session.id}>
                {session.title ?? truncateId(session.id, 14, 6)}
              </span>
              <StatusBadge status={session.status} />
            </div>
            <div className="meta">
              <span>
                {session.modelProvider}/{session.modelId}
              </span>
              <span>{formatRelativeTime(session.updatedAt)}</span>
            </div>
            <div className="meta">
              <span className="dim">turns {session.turnCount}</span>
              <span className="dim">
                {session.inputTokens + session.outputTokens} tok
              </span>
            </div>
          </li>
        ))}
      </ul>

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
