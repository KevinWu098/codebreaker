import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { JsonView } from "@/components/json-view";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { Spinner } from "@/components/spinner";
import { useAsync } from "@/hooks/use-async";
import { api } from "@/lib/api";
import { useConnection } from "@/lib/connection";
import { formatRelativeTime, truncateId } from "@/lib/format";

export const AdminPanel = (): React.JSX.Element => {
  const connection = useConnection();
  const enabled = connection.token.length > 0;
  const baseKey = `${connection.baseUrl}:${connection.token}`;

  const health = useAsync(() => api.shimHealth(), {
    enabled,
    key: `health:${baseKey}`,
    pollMs: 10_000,
  });

  const sandboxes = useAsync(() => api.shimSandboxes(), {
    enabled,
    key: `sandboxes:${baseKey}`,
    pollMs: 8000,
  });

  const sandboxCount = sandboxes.data?.sandboxes.length;
  const sandboxesTitle =
    sandboxCount === undefined ? "sandboxes" : `sandboxes · ${sandboxCount}`;

  return (
    <div className="space-y-4">
      <PageHeader
        actions={
          <RefreshButton
            disabled={!enabled}
            loading={health.loading || sandboxes.loading}
            onClick={() => {
              health.refresh();
              sandboxes.refresh();
            }}
          />
        }
        description="operator inspection of the modal https shim."
        title="admin · modal shim"
      />

      {!enabled && (
        <EmptyState
          hint="set a jwt in the sidebar to access /admin endpoints."
          title="admin endpoints require auth"
        />
      )}

      <Card
        actions={
          <RefreshButton
            disabled={!enabled}
            loading={health.loading}
            onClick={() => health.refresh()}
          />
        }
        title="shim health"
      >
        <ErrorState error={health.error} title="shim health failed" />
        {health.data && <JsonView maxHeight={320} value={health.data.health} />}
        {!health.data && enabled && <Spinner />}
      </Card>

      <Card
        actions={
          <RefreshButton
            disabled={!enabled}
            loading={sandboxes.loading}
            onClick={() => sandboxes.refresh()}
          />
        }
        bodyClassName="p-0"
        title={sandboxesTitle}
      >
        <ErrorState
          className="m-3"
          error={sandboxes.error}
          title="sandboxes failed"
        />
        {sandboxes.data?.sandboxes.length === 0 && (
          <EmptyState
            className="m-3"
            hint="no sandboxes have been provisioned."
            title="no active sandboxes"
          />
        )}
        {sandboxes.data && sandboxes.data.sandboxes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="table">
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
                    <td className="font-mono text-fg">{entry.session_id}</td>
                    <td className="lowercase">{entry.profile}</td>
                    <td
                      className="font-mono text-fg-muted"
                      title={entry.sandbox_id}
                    >
                      {truncateId(entry.sandbox_id, 14, 6)}
                    </td>
                    <td
                      className="font-mono text-fg-muted"
                      title={entry.image_fingerprint}
                    >
                      {truncateId(entry.image_fingerprint, 12, 4)}
                    </td>
                    <td className="font-mono text-fg-muted">
                      {entry.snapshot_id ? truncateId(entry.snapshot_id) : "—"}
                    </td>
                    <td
                      className="text-fg-muted"
                      title={new Date(entry.created_at * 1000).toISOString()}
                    >
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
