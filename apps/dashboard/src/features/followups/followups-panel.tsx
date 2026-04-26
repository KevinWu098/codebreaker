import type { CveFollowupSummary } from "@codebreaker/benchmark-runner/schemas";
import { truncateId } from "@codebreaker/shared/lib/utils";
import { FlaskConical } from "lucide-react";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { DevinWord } from "@/components/devin-word";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { Spinner } from "@/components/spinner";
import { useCveFollowupsListQuery } from "@/hooks/queries";
import { isAuthorized, useConnection } from "@/lib/connection";
import { formatRelativeTime } from "@/lib/format";
import { CveFollowupRunSection } from "./cve-followup-detail";

interface FollowupsPanelProps {
  onOpenBenchmarkRun: (runId: string) => void;
  onSelectRun: (runId: string | null) => void;
  selectedRunId: string | null;
}

export const FollowupsPanel = ({
  onOpenBenchmarkRun,
  onSelectRun,
  selectedRunId,
}: FollowupsPanelProps): React.JSX.Element => {
  const connection = useConnection();
  const enabled = isAuthorized(connection);
  const listQuery = useCveFollowupsListQuery();
  const rows = listQuery.data?.followups ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        actions={
          <RefreshButton
            disabled={!enabled}
            loading={listQuery.isFetching}
            onClick={() => listQuery.refetch()}
          />
        }
        description="all CVE follow-up workflows in d1, newest first (up to 200 rows)."
        title="follow-ups"
      />

      {!enabled && (
        <EmptyState
          hint="set a jwt in the sidebar to load follow-ups."
          title="no token configured"
        />
      )}

      <ErrorState error={listQuery.error} title="list failed" />

      {enabled && listQuery.isLoading && (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      )}

      {enabled && listQuery.data && rows.length === 0 && (
        <EmptyState
          hint="start one from a completed benchmark run, or wait for an auto-fired workflow."
          title="no follow-ups yet"
        />
      )}

      {rows.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(500px,1fr)]">
          <Card
            bodyClassName="p-0"
            className="min-w-0 overflow-hidden"
            title="workflows"
          >
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>follow-up</th>
                    <th>task</th>
                    <th>ghsa</th>
                    <th>status</th>
                    <th>
                      <DevinWord />
                    </th>
                    <th>auto</th>
                    <th>run</th>
                    <th className="w-28 whitespace-nowrap">updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <FollowupTableRow
                      key={row.followup.id}
                      onSelect={onSelectRun}
                      row={row}
                      selected={row.followup.runId === selectedRunId}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {selectedRunId && enabled ? (
            <Card
              actions={
                <Button
                  onClick={() => onOpenBenchmarkRun(selectedRunId)}
                  variant="ghost"
                >
                  <FlaskConical aria-hidden="true" size={12} />
                  <span>open in benchmarks</span>
                </Button>
              }
              className="min-w-0"
              title={`detail · run ${truncateId(selectedRunId)}`}
            >
              <CveFollowupRunSection
                allowWhenRunIncomplete
                runId={selectedRunId}
                runStatus="completed"
              />
            </Card>
          ) : (
            <Card className="min-w-0" title="workflow detail">
              <EmptyState
                hint="select a follow-up from the table to inspect stages, Devin sessions, validation, and events."
                title="no follow-up selected"
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

const FollowupTableRow = ({
  onSelect,
  row,
  selected,
}: {
  onSelect: (runId: string) => void;
  row: CveFollowupSummary;
  selected: boolean;
}): React.JSX.Element => {
  const { followup, stages } = row;
  const devinStages = stages.filter((stage) => stage.devinSessionId);

  return (
    <tr
      aria-selected={selected}
      className={selected ? "bg-bg-hover" : undefined}
    >
      <td>
        <button
          className="id-link block max-w-32 truncate text-left font-mono text-xs"
          onClick={() => onSelect(followup.runId)}
          title={followup.id}
          type="button"
        >
          {followup.id}
        </button>
      </td>
      <td
        className="max-w-40 truncate font-mono text-fg-muted text-xs"
        title={followup.taskId}
      >
        {followup.taskId}
      </td>
      <td
        className="max-w-36 truncate font-mono text-fg-muted text-xs"
        title={followup.ghsaId}
      >
        {followup.ghsaId}
      </td>
      <td>
        <Badge status={followup.status} />
      </td>
      <td className="text-fg-muted">
        {devinStages.length > 0 ? (
          <span title={devinStages.map((stage) => stage.kind).join(", ")}>
            {devinStages.length} session{devinStages.length === 1 ? "" : "s"}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="text-fg-muted">{followup.autoFired ? "yes" : "no"}</td>
      <td>
        <button
          className="id-link block max-w-28 truncate text-left"
          onClick={() => onSelect(followup.runId)}
          title={followup.runId}
          type="button"
        >
          {truncateId(followup.runId)}
        </button>
      </td>
      <td
        className="whitespace-nowrap text-fg-muted"
        title={new Date(followup.updatedAt).toISOString()}
      >
        {formatRelativeTime(followup.updatedAt)}
      </td>
    </tr>
  );
};
