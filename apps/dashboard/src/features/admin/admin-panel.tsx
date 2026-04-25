import type { ReactNode } from "react";
import { Card } from "../../components/card";
import { ErrorBanner } from "../../components/error-banner";
import { JsonView } from "../../components/json-view";
import { RefreshButton } from "../../components/refresh-button";
import { useAsync } from "../../hooks/use-async";
import { api } from "../../lib/api";
import { useConnection } from "../../lib/connection";
import { formatRelativeTime } from "../../lib/format";

export const AdminPanel = (): React.JSX.Element => {
  const connection = useConnection();
  const enabled = connection.token.length > 0;

  const health = useAsync(
    () => api.shimHealth(),
    [connection.baseUrl, connection.token],
    { enabled, pollMs: 10_000 }
  );

  const sandboxes = useAsync(
    () => api.shimSandboxes(),
    [connection.baseUrl, connection.token],
    { enabled, pollMs: 8000 }
  );

  const sandboxesTitle: ReactNode = `Sandboxes (${
    sandboxes.data?.sandboxes.length ?? "—"
  })`;

  return (
    <div className="main">
      <div className="detail-header">
        <div>
          <h2>Admin · Modal shim</h2>
          <div className="sub">Operator inspection of the Modal HTTPS shim</div>
        </div>
        <div className="actions">
          <button
            className="btn"
            onClick={() => {
              health.refresh();
              sandboxes.refresh();
            }}
            type="button"
          >
            Refresh
          </button>
        </div>
      </div>

      {!enabled && (
        <div className="banner banner-warn">
          Set a JWT token in the top bar to access /admin endpoints.
        </div>
      )}

      <Card
        actions={<RefreshButton onClick={() => health.refresh()} />}
        title="Shim health"
      >
        <ErrorBanner error={health.error} title="Shim health failed" />
        {health.data ? (
          <JsonView value={health.data.health} />
        ) : (
          <span className="dim">Loading…</span>
        )}
      </Card>

      <Card
        actions={<RefreshButton onClick={() => sandboxes.refresh()} />}
        title={sandboxesTitle}
      >
        <ErrorBanner error={sandboxes.error} title="Sandboxes failed" />
        {sandboxes.data?.sandboxes.length === 0 && (
          <div className="empty">No active sandboxes</div>
        )}
        {sandboxes.data && sandboxes.data.sandboxes.length > 0 && (
          <div className="scroll-x">
            <table className="data">
              <thead>
                <tr>
                  <th>session</th>
                  <th>profile</th>
                  <th>sandbox id</th>
                  <th>image fp</th>
                  <th>snapshot</th>
                  <th>created</th>
                </tr>
              </thead>
              <tbody>
                {sandboxes.data.sandboxes.map((entry) => (
                  <tr key={entry.sandbox_id}>
                    <td className="mono">{entry.session_id}</td>
                    <td>{entry.profile}</td>
                    <td className="mono">{entry.sandbox_id}</td>
                    <td className="mono dim">{entry.image_fingerprint}</td>
                    <td className="mono dim">{entry.snapshot_id ?? "—"}</td>
                    <td title={new Date(entry.created_at * 1000).toISOString()}>
                      {formatRelativeTime(entry.created_at * 1000)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
