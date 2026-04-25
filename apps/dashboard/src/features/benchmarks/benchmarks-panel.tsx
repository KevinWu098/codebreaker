import type { BenchmarkRunRow } from "@codebreaker/benchmark-runner/schemas";
import {
  MODEL_OPTIONS,
  MODEL_OPTIONS_BY_PROVIDER,
  MODEL_PROVIDERS,
} from "@codebreaker/shared/lib/models";
import { Play, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { DefinitionField } from "@/components/definition-field";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { JsonView } from "@/components/json-view";
import { PageHeader } from "@/components/page-header";
import { Spinner } from "@/components/spinner";
import {
  useCleanupBenchmarkRunMutation,
  useCreateBenchmarkRunMutation,
  useStartBenchmarkRunMutation,
} from "@/hooks/mutations";
import {
  useBenchmarkRunQuery,
  useBenchmarkRunsQuery,
  useBenchmarkTasksQuery,
} from "@/hooks/queries";
import { isAuthorized, useConnection } from "@/lib/connection";
import { formatRelativeTime } from "@/lib/format";

const DEFAULT_MODEL = MODEL_OPTIONS_BY_PROVIDER.anthropic[0];
const modelValue = (model: (typeof MODEL_OPTIONS)[number]): string =>
  `${model.provider}/${model.id}`;
const DEFAULT_MODEL_VALUE = modelValue(DEFAULT_MODEL);

const badgeStatusForRun = (status: BenchmarkRunRow["status"]): string => {
  if (status === "completed") {
    return "completed";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "pending") {
    return "pending";
  }

  return "running";
};

export interface BenchmarksPanelProps {
  onOpenSession?: (sessionId: string) => void;
  onSelectRun?: (runId: string) => void;
  selectedRunId?: string | null;
}

export const BenchmarksPanel = ({
  onOpenSession,
  onSelectRun,
  selectedRunId,
}: BenchmarksPanelProps): React.JSX.Element => {
  const connection = useConnection();
  const enabled = isAuthorized(connection);
  const tasks = useBenchmarkTasksQuery();
  const runs = useBenchmarkRunsQuery();
  const createRun = useCreateBenchmarkRunMutation();
  const [localSelectedRunId, setLocalSelectedRunId] = useState<string | null>(
    null
  );
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [difficulty, setDifficulty] = useState<"L0" | "L1">("L1");
  const [model, setModel] = useState(DEFAULT_MODEL_VALUE);
  const activeRunId = selectedRunId ?? localSelectedRunId;
  const selectRun = (runId: string): void => {
    setLocalSelectedRunId(runId);
    onSelectRun?.(runId);
  };
  const selectedRun = activeRunId ? (
    <BenchmarkRunDetail
      {...(onOpenSession ? { onOpenSession } : {})}
      runId={activeRunId}
    />
  ) : null;

  const startRun = (): void => {
    const selectedModel = MODEL_OPTIONS.find(
      (option) => modelValue(option) === model
    );

    if (!(selectedTaskId && selectedModel)) {
      return;
    }

    createRun.mutate(
      {
        autoStart: true,
        cleanupPolicy: "retain",
        difficulty,
        maxTurns: 20,
        model: {
          id: selectedModel.id,
          provider: selectedModel.provider,
        },
        taskId: selectedTaskId,
        timeoutSeconds: 1800,
      },
      {
        onSuccess: (response) => selectRun(response.run.id),
      }
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        actions={
          <Button
            disabled={!enabled || createRun.isPending}
            onClick={startRun}
            variant="primary"
          >
            <Play aria-hidden="true" size={12} />
            <span>{createRun.isPending ? "running…" : "run benchmark"}</span>
          </Button>
        }
        description="start and observe control-plane owned benchmark runs."
        title="benchmarks"
      />

      {!enabled && (
        <EmptyState
          hint="set a jwt in the sidebar to load benchmark tasks."
          title="no token configured"
        />
      )}

      <ErrorState error={tasks.error} title="tasks unavailable" />
      <ErrorState error={runs.error} title="runs unavailable" />
      <ErrorState error={createRun.error} title="run failed" />

      <Card title="new benchmark run">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs">
            <span className="field-label">task</span>
            <select
              className="input"
              onChange={(event) => setSelectedTaskId(event.target.value)}
              value={selectedTaskId}
            >
              <option value="">select task</option>
              {(tasks.data?.tasks ?? []).map((task) => (
                <option key={task.taskId} value={task.taskId}>
                  {task.taskId}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="field-label">difficulty</span>
            <select
              className="input"
              onChange={(event) =>
                setDifficulty(event.target.value as "L0" | "L1")
              }
              value={difficulty}
            >
              <option value="L0">L0</option>
              <option value="L1">L1</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="field-label">model</span>
            <select
              className="input"
              onChange={(event) => setModel(event.target.value)}
              value={model}
            >
              {MODEL_PROVIDERS.map((provider) => (
                <optgroup key={provider} label={provider}>
                  {MODEL_OPTIONS_BY_PROVIDER[provider].map((option) => (
                    <option
                      key={option.id}
                      title={`Documented at ${option.documentationUrl}`}
                      value={modelValue(option)}
                    >
                      {option.label} ({option.id})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <BenchmarkRunsTable
          loading={runs.isLoading}
          onSelect={selectRun}
          runs={runs.data?.runs ?? []}
          selectedRunId={activeRunId}
        />
        {selectedRun}
      </div>
    </div>
  );
};

const BenchmarkRunsTable = ({
  loading,
  onSelect,
  runs,
  selectedRunId,
}: {
  loading: boolean;
  onSelect: (id: string) => void;
  runs: BenchmarkRunRow[];
  selectedRunId: string | null;
}): React.JSX.Element => (
  <Card
    actions={
      <span
        className="btn pointer-events-none select-none border-transparent bg-transparent text-fg-muted hover:border-transparent hover:bg-transparent"
        title="this list updates automatically"
      >
        <RefreshCw aria-hidden="true" className="shrink-0" size={12} />
        <span>auto</span>
      </span>
    }
    title="runs"
  >
    {loading && <Spinner />}
    {!loading && runs.length === 0 && (
      <EmptyState hint="start a benchmark run above." title="no runs yet" />
    )}
    {runs.length > 0 && (
      <table className="table">
        <thead>
          <tr>
            <th>run</th>
            <th>task</th>
            <th>status</th>
            <th className="num">score</th>
            <th>updated</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr
              aria-selected={run.id === selectedRunId}
              className={run.id === selectedRunId ? "bg-bg-hover" : undefined}
              key={run.id}
            >
              <td>
                <button
                  className="id-link"
                  onClick={() => onSelect(run.id)}
                  type="button"
                >
                  {run.id.slice(0, 8)}
                </button>
              </td>
              <td className="font-mono text-fg-muted">{run.taskId}</td>
              <td>
                <Badge status={badgeStatusForRun(run.status)} />
              </td>
              <td className="num">{run.score?.toFixed(2) ?? "—"}</td>
              <td className="text-fg-muted">
                {formatRelativeTime(run.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </Card>
);

const BenchmarkRunDetail = ({
  onOpenSession,
  runId,
}: {
  onOpenSession?: (sessionId: string) => void;
  runId: string;
}): React.JSX.Element => {
  const detail = useBenchmarkRunQuery(runId);
  const cleanup = useCleanupBenchmarkRunMutation(runId);
  const start = useStartBenchmarkRunMutation(runId);
  const run = detail.data?.run;
  const canStart =
    run?.status === "pending" ||
    run?.status === "failed" ||
    run?.status === "cancelled";

  let sessionValue: React.ReactNode = "—";
  if (run?.sessionId) {
    if (onOpenSession) {
      const sid = run.sessionId;
      sessionValue = (
        <button
          className="id-link break-all text-left"
          onClick={() => onOpenSession(sid)}
          type="button"
        >
          {sid}
        </button>
      );
    } else {
      sessionValue = <span className="break-all">{run.sessionId}</span>;
    }
  }

  return (
    <Card
      actions={
        <div className="flex gap-2">
          <Button
            disabled={!canStart || start.isPending}
            onClick={() => start.mutate()}
          >
            <Play aria-hidden="true" size={12} />
            <span>{start.isPending ? "starting…" : "start"}</span>
          </Button>
          <Button
            disabled={cleanup.isPending}
            onClick={() => cleanup.mutate()}
            variant="danger"
          >
            <Trash2 aria-hidden="true" size={12} />
            <span>cleanup</span>
          </Button>
        </div>
      }
      title="run detail"
    >
      <ErrorState error={detail.error} title="detail unavailable" />
      <ErrorState error={cleanup.error} title="cleanup failed" />
      <ErrorState error={start.error} title="start failed" />
      {!detail.data && <Spinner />}
      {run && (
        <dl className="mb-4 grid grid-cols-[120px_1fr] gap-x-3 gap-y-2 text-xs">
          <DefinitionField label="id" mono>
            {run.id}
          </DefinitionField>
          <DefinitionField label="task" mono>
            {run.taskId}
          </DefinitionField>
          <DefinitionField label="status">
            <Badge status={badgeStatusForRun(run.status)} />
          </DefinitionField>
          <DefinitionField label="session" mono>
            {sessionValue}
          </DefinitionField>
          <DefinitionField label="score" numeric>
            {run.score?.toFixed(2) ?? "—"}
          </DefinitionField>
          <DefinitionField label="artifact" mono>
            {run.artifactPath ?? "—"}
          </DefinitionField>
        </dl>
      )}
      {detail.data && <JsonView maxHeight={420} value={detail.data} />}
    </Card>
  );
};
