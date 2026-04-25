import { useState } from "react";
import { Card } from "../../components/card";
import { ErrorBanner } from "../../components/error-banner";
import { JsonView } from "../../components/json-view";
import { RefreshButton } from "../../components/refresh-button";
import { StatusBadge } from "../../components/status-badge";
import { useAsync } from "../../hooks/use-async";
import { api } from "../../lib/api";
import { useConnection } from "../../lib/connection";
import { formatNumber, formatRelativeTime } from "../../lib/format";
import { ChatPanel } from "../chat/chat-panel";
import { SandboxPanel } from "../sandbox/sandbox-panel";
import { MessagesPanel } from "./messages-panel";

type Tab = "overview" | "config" | "messages" | "chat" | "sandbox";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "config", label: "Config" },
  { id: "messages", label: "Messages" },
  { id: "chat", label: "Chat" },
  { id: "sandbox", label: "Sandbox" },
];

interface Props {
  onArchived: () => void;
  sessionId: string;
}

export const SessionDetail = ({
  sessionId,
  onArchived,
}: Props): React.JSX.Element => {
  const connection = useConnection();
  const [tab, setTab] = useState<Tab>("overview");
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<Error | undefined>(
    undefined
  );

  const session = useAsync(
    () => api.getSession(sessionId),
    [sessionId, connection.baseUrl, connection.token],
    { enabled: connection.token.length > 0, pollMs: 4000 }
  );

  const state = useAsync(
    () => api.getState(sessionId),
    [sessionId, connection.baseUrl, connection.token],
    { enabled: connection.token.length > 0, pollMs: 4000 }
  );

  const config = useAsync(
    () => api.getConfig(sessionId),
    [sessionId, connection.baseUrl, connection.token, tab],
    { enabled: connection.token.length > 0 && tab === "config" }
  );

  const archive = async (): Promise<void> => {
    if (!window.confirm(`Archive session ${sessionId}?`)) {
      return;
    }

    setArchiving(true);
    setArchiveError(undefined);

    try {
      await api.archiveSession(sessionId);
      onArchived();
    } catch (err) {
      setArchiveError(err instanceof Error ? err : new Error("Unknown error"));
    } finally {
      setArchiving(false);
    }
  };

  const row = session.data?.session;
  const refreshOverview = (): void => {
    session.refresh();
    state.refresh();
  };

  return (
    <div className="main">
      <div className="detail-header">
        <div>
          <h2>{row?.title ?? sessionId}</h2>
          <div className="sub mono">
            {sessionId}
            {row && (
              <>
                {" · "}
                <StatusBadge status={row.status} />
                {" · "}
                <span className="dim">
                  updated {formatRelativeTime(row.updatedAt)}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={refreshOverview} type="button">
            Refresh
          </button>
          <button
            className="btn btn-danger"
            disabled={archiving || row?.status === "archived"}
            onClick={archive}
            type="button"
          >
            {archiving ? "Archiving…" : "Archive"}
          </button>
        </div>
      </div>

      <ErrorBanner error={archiveError} title="Archive failed" />

      <div className="tabs">
        {TABS.map((entry) => (
          <button
            className={tab === entry.id ? "active" : ""}
            key={entry.id}
            onClick={() => setTab(entry.id)}
            type="button"
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <ErrorBanner error={session.error} title="Load failed" />
          {row && (
            <Card title="D1 session row">
              <dl className="kv">
                <dt>id</dt>
                <dd>{row.id}</dd>
                <dt>status</dt>
                <dd>
                  <StatusBadge status={row.status} />
                </dd>
                <dt>title</dt>
                <dd>{row.title ?? "—"}</dd>
                <dt>model</dt>
                <dd>
                  {row.modelProvider}/{row.modelId}
                </dd>
                <dt>repo</dt>
                <dd>
                  {row.repoOwner
                    ? `${row.repoOwner}/${row.repoName}`
                    : (row.repoName ?? "—")}
                </dd>
                <dt>turns</dt>
                <dd>{formatNumber(row.turnCount)}</dd>
                <dt>input tokens</dt>
                <dd>{formatNumber(row.inputTokens)}</dd>
                <dt>output tokens</dt>
                <dd>{formatNumber(row.outputTokens)}</dd>
                <dt>created</dt>
                <dd>{row.createdAt}</dd>
                <dt>updated</dt>
                <dd>{row.updatedAt}</dd>
                <dt>completed</dt>
                <dd>{row.completedAt ?? "—"}</dd>
              </dl>
            </Card>
          )}

          <Card
            actions={<RefreshButton onClick={() => state.refresh()} />}
            title="Durable Object state"
          >
            <ErrorBanner error={state.error} title="State unavailable" />
            {state.data ? (
              <JsonView value={state.data.state} />
            ) : (
              <span className="dim">Loading…</span>
            )}
          </Card>
        </>
      )}

      {tab === "config" && (
        <Card
          actions={<RefreshButton onClick={() => config.refresh()} />}
          title="Session config (from agent)"
        >
          <ErrorBanner error={config.error} title="Config unavailable" />
          {config.data ? (
            <JsonView value={config.data.config} />
          ) : (
            <span className="dim">Loading…</span>
          )}
        </Card>
      )}

      {tab === "messages" && <MessagesPanel sessionId={sessionId} />}
      {tab === "chat" && <ChatPanel sessionId={sessionId} />}
      {tab === "sandbox" && <SandboxPanel sessionId={sessionId} />}
    </div>
  );
};
