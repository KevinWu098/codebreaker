import type {
  BenchmarkCleanupPolicy,
  BenchmarkRunEvent,
  BenchmarkRunLocation,
  BenchmarkRunModel,
  BenchmarkRunResult,
  BenchmarkRunRow,
  BenchmarkRunScoreBreakdown,
  BenchmarkTaskSummary,
  CreateBenchmarkRunRequest,
  Difficulty,
  TaskInstance,
} from "@codebreaker/benchmark-runner/schemas";
import {
  estimateTokenUsageCost,
  MODEL_OPTIONS,
  MODEL_OPTIONS_BY_PROVIDER,
  MODEL_PROVIDERS,
} from "@codebreaker/shared/lib/models";
import {
  Content as TabsContent,
  List as TabsList,
  Root as TabsRoot,
  Trigger as TabsTrigger,
} from "@radix-ui/react-tabs";
import {
  BarChart3,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  Trash2,
} from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useState } from "react";
import { AppButton } from "@/components/app-button";
import { Card } from "@/components/card";
import { DefinitionField } from "@/components/definition-field";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { JsonView } from "@/components/json-view";
import { LoadingState } from "@/components/loading-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import {
  useCancelBenchmarkRunMutation,
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
import {
  formatDuration,
  formatNumber,
  formatRelativeTime,
  formatUsd,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const DEFAULT_MODEL = MODEL_OPTIONS_BY_PROVIDER.kimi[0];
const BENCHMARK_MAX_INPUT_TOKENS = 300_000;
const BENCHMARK_MAX_STEPS = 50;
const BENCHMARK_MAX_TOOL_CALLS = 40;
const BENCHMARK_MAX_TOTAL_TOKENS = 400_000;
const BENCHMARK_MAX_TURNS = 1;
const BENCHMARK_TIMEOUT_SECONDS = 600;
const DEFAULT_BATCH_REPEAT_COUNT = 1;
const DIFFICULTY_OPTIONS: readonly Difficulty[] = ["L0", "L1", "L2", "L3"];
const BENCHMARK_TAB_IDS = ["results", "create"] as const;

/** dl: UA `dd` margin causes overlap; `min-w-0` lets long values wrap in `1fr`. */
const BENCHMARK_DL_GRID =
  "grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,auto)_1fr] sm:items-baseline [&_dt]:m-0 [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:break-words";

type BenchmarkTab = (typeof BENCHMARK_TAB_IDS)[number];

const createBenchmarkRequestFromRun = (
  run: BenchmarkRunRow
): CreateBenchmarkRunRequest => ({
  autoStart: true,
  cleanupPolicy: run.cleanupPolicy,
  difficulty: run.difficulty,
  maxInputTokens: BENCHMARK_MAX_INPUT_TOKENS,
  maxSteps: BENCHMARK_MAX_STEPS,
  maxToolCalls: BENCHMARK_MAX_TOOL_CALLS,
  maxTotalTokens: BENCHMARK_MAX_TOTAL_TOKENS,
  maxTurns: BENCHMARK_MAX_TURNS,
  model: {
    id: run.modelId,
    provider: run.modelProvider,
  },
  taskId: run.taskId,
  timeoutSeconds: BENCHMARK_TIMEOUT_SECONDS,
});

const createBenchmarkRequestsFromBatch = ({
  cleanupPolicy,
  difficulties,
  models,
  repeatCount,
  tasks,
}: {
  cleanupPolicy: BenchmarkCleanupPolicy;
  difficulties: Difficulty[];
  models: BenchmarkRunModel[];
  repeatCount: number;
  tasks: BenchmarkTaskSummary[];
}): CreateBenchmarkRunRequest[] => {
  const requests: CreateBenchmarkRunRequest[] = [];

  for (const task of tasks) {
    for (const difficulty of difficulties.filter((difficultyOption) =>
      task.difficulties.includes(difficultyOption)
    )) {
      for (const model of models) {
        for (let i = 0; i < repeatCount; i += 1) {
          requests.push({
            autoStart: true,
            cleanupPolicy,
            difficulty,
            maxInputTokens: BENCHMARK_MAX_INPUT_TOKENS,
            maxSteps: BENCHMARK_MAX_STEPS,
            maxToolCalls: BENCHMARK_MAX_TOOL_CALLS,
            maxTotalTokens: BENCHMARK_MAX_TOTAL_TOKENS,
            maxTurns: BENCHMARK_MAX_TURNS,
            model,
            taskId: task.taskId,
            timeoutSeconds: BENCHMARK_TIMEOUT_SECONDS,
          });
        }
      }
    }
  }

  return requests;
};

const buildBatchRequests = ({
  difficulties,
  models,
  repeatCount,
  tasks,
}: {
  difficulties: Difficulty[];
  models: BenchmarkRunModel[];
  repeatCount: number;
  tasks: BenchmarkTaskSummary[];
}):
  | { error: string; requests: null }
  | {
      error: null;
      requests: CreateBenchmarkRunRequest[];
    } => {
  if (tasks.length === 0) {
    return { error: "Select at least one task.", requests: null };
  }
  if (difficulties.length === 0) {
    return { error: "Select at least one level.", requests: null };
  }
  if (models.length === 0) {
    return { error: "Select at least one model.", requests: null };
  }
  if (!(Number.isInteger(repeatCount) && repeatCount > 0)) {
    return {
      error: "Repeat count must be a positive whole number.",
      requests: null,
    };
  }

  const requests = createBenchmarkRequestsFromBatch({
    cleanupPolicy: "retain",
    difficulties,
    models,
    repeatCount,
    tasks,
  });

  if (requests.length === 0) {
    return {
      error: "No selected task supports the selected level(s).",
      requests: null,
    };
  }

  return { error: null, requests };
};

const modelValue = (model: (typeof MODEL_OPTIONS)[number]): string =>
  `${model.provider}/${model.id}`;
const DEFAULT_MODEL_VALUE = modelValue(DEFAULT_MODEL);

const taskWithDifficulty = (
  run: Pick<BenchmarkRunRow, "difficulty" | "taskId">
): string => `${run.taskId} ${run.difficulty}`;

const formatBool = (v: boolean | null): string => {
  if (v === true) {
    return "yes";
  }
  if (v === false) {
    return "no";
  }
  return "—";
};

const formatMatch = (m: boolean | null): string => {
  if (m === true) {
    return "right";
  }
  if (m === false) {
    return "wrong";
  }
  return "—";
};

const triCheckIcon = (v: boolean | null): string => {
  if (v === true) {
    return "✓";
  }
  if (v === false) {
    return "✗";
  }
  return "—";
};

const locationCountSummary = (
  correct: number | null,
  expectedCount: number | undefined
): string => {
  if (correct == null) {
    return "";
  }
  if (expectedCount != null) {
    return ` · ${correct} of ${expectedCount} ground-truth location(s) matched`;
  }
  return ` · ${correct} ground-truth location(s) matched`;
};

const scoreBreakdownLocationCaption = (
  b: BenchmarkRunScoreBreakdown
): string => {
  if (b.correctLocations != null) {
    return `${b.correctLocations} loc`;
  }
  if (b.locationScore != null) {
    return b.locationScore.toFixed(2);
  }
  return "—";
};

const locHintDetailSuffix = (b: BenchmarkRunScoreBreakdown): string => {
  if (b.correctLocations == null) {
    return "";
  }
  return `, ${b.correctLocations} ground-truth location(s) correct`;
};

const BenchmarkRunScoringDetail = ({
  locations,
  result,
  run,
  task,
}: {
  locations: BenchmarkRunLocation[];
  result: BenchmarkRunResult | null;
  run: BenchmarkRunRow;
  task: TaskInstance | null;
}): React.JSX.Element => {
  if (!result) {
    return (
      <div className="mb-4 text-xs">
        <div className="field-label mb-2">scoring</div>
        <p className="text-fg-muted">
          {run.score == null
            ? "no scored result yet."
            : `composite ${run.score.toFixed(2)} (no breakdown stored).`}
        </p>
      </div>
    );
  }

  const composite = result.score?.score ?? run.score;
  const expectedLocCount = task?.ground_truth.locations.length;

  return (
    <div className="mb-4 space-y-3 text-xs">
      <div className="field-label">scoring</div>
      <dl className={BENCHMARK_DL_GRID}>
        <dt className="text-fg-muted">composite</dt>
        <dd className="num">
          {composite == null ? "—" : composite.toFixed(2)}
        </dd>
        <dt className="text-fg-muted">vulnerability</dt>
        <dd>
          expected {formatBool(result.expectedVulnerable)} · predicted{" "}
          {formatBool(result.predictedVulnerable)} ·{" "}
          <span
            className={
              result.vulnerableMatched === false ? "font-medium text-fg" : ""
            }
          >
            {formatMatch(result.vulnerableMatched)}
          </span>
        </dd>
        <dt className="text-fg-muted">vuln class</dt>
        <dd className="break-words">
          expected {result.expectedVulnClass ?? "—"} · predicted{" "}
          {result.predictedVulnClass ?? "—"} ·{" "}
          <span
            className={
              result.vulnClassMatched === false ? "font-medium text-fg" : ""
            }
          >
            {formatMatch(result.vulnClassMatched)}
          </span>
        </dd>
        <dt className="text-fg-muted">locations</dt>
        <dd>
          subscore {result.locationScore?.toFixed(2) ?? "—"}
          {locationCountSummary(result.correctLocations, expectedLocCount)}
        </dd>
      </dl>
      {locations.length > 0 && (
        <div className="space-y-1">
          <div className="text-fg-muted">predicted locations</div>
          <table className="table">
            <thead>
              <tr>
                <th>file</th>
                <th>function</th>
                <th className="num">ground truth</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => (
                <tr key={loc.id}>
                  <td className="max-w-[12rem] break-all font-mono text-[11px]">
                    {loc.file}
                  </td>
                  <td className="font-mono text-[11px] text-fg-muted">
                    {loc.function ?? "—"}
                  </td>
                  <td className="num">{formatMatch(loc.matchedGroundTruth)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const scoreColumnForRun = (run: BenchmarkRunRow): React.ReactNode => {
  const line = run.score?.toFixed(2) ?? "—";
  const b = run.scoreBreakdown;
  if (!b) {
    return line;
  }

  const vHint = `vulnerability (expected vs predicted): ${formatMatch(
    b.vulnerableMatched
  )}`;
  const cHint = `vulnerability class: ${formatMatch(b.vulnClassMatched)}`;
  const locHint = `location subscore${locHintDetailSuffix(b)}`;
  const locText = scoreBreakdownLocationCaption(b);

  return (
    <div className="text-right">
      <div>{line}</div>
      <div
        className="mt-0.5 text-[10px] text-fg-muted leading-tight"
        title={`${vHint}. ${cHint}. ${locHint}.`}
      >
        <span title={vHint}>V{triCheckIcon(b.vulnerableMatched)}</span>{" "}
        <span title={cHint}>C{triCheckIcon(b.vulnClassMatched)}</span>{" "}
        <span title={locHint}>L {locText}</span>
      </div>
    </div>
  );
};

/*
const scoreText = (score: number | null | undefined): string =>
  score == null ? "—" : score.toFixed(2);

const average = (values: number[]): number | null => {
  if (values.length === 0) {
    return null;
  }

  let total = 0;
  for (const value of values) {
    total += value;
  }

  return total / values.length;
};

const booleanRate = (
  values: Array<boolean | null | undefined>
): number | null => {
  const known = values.filter((value): value is boolean => value != null);
  if (known.length === 0) {
    return null;
  }

  let matches = 0;
  for (const value of known) {
    if (value) {
      matches += 1;
    }
  }

  return matches / known.length;
};
*/

const percentText = (value: number | null): string =>
  value == null ? "—" : `${Math.round(value * 100)}%`;

const runDuration = (run: BenchmarkRunRow): string => {
  if (!run.completedAt) {
    return "—";
  }

  const startedAt = new Date(run.createdAt).getTime();
  const completedAt = new Date(run.completedAt).getTime();
  if (Number.isNaN(startedAt) || Number.isNaN(completedAt)) {
    return "—";
  }

  return formatDuration(Math.max(0, completedAt - startedAt));
};

/*
const totalTokenCount = (run: BenchmarkRunRow): number | null => {
  if (run.inputTokens == null || run.outputTokens == null) {
    return null;
  }

  return run.inputTokens + run.outputTokens;
};

const runCost = (run: BenchmarkRunRow): number | null => {
  if (run.inputTokens == null || run.outputTokens == null) {
    return null;
  }

  const tokenCost = estimateTokenUsageCost({
    inputTokens: run.inputTokens,
    modelId: run.modelId,
    modelProvider: run.modelProvider,
    outputTokens: run.outputTokens,
  });

  return tokenCost?.totalUsd ?? null;
};
*/

const badgeStatusForRun = (status: BenchmarkRunRow["status"]): string => status;

const benchmarkRunTokensLine = (run: BenchmarkRunRow): React.ReactNode => {
  if (run.inputTokens == null || run.outputTokens == null || !run.sessionId) {
    return "—";
  }

  const total = run.inputTokens + run.outputTokens;
  const tokenCost = estimateTokenUsageCost({
    inputTokens: run.inputTokens,
    modelId: run.modelId,
    modelProvider: run.modelProvider,
    outputTokens: run.outputTokens,
  });

  return (
    <span>
      {formatNumber(run.inputTokens)} / {formatNumber(run.outputTokens)} /{" "}
      {formatNumber(total)}
      {tokenCost ? (
        <span
          className="ml-1 text-fg-muted"
          title={`${formatUsd(tokenCost.pricing.inputUsdPerMillionTokens)} input / ${formatUsd(tokenCost.pricing.outputUsdPerMillionTokens)} output per 1M tokens`}
        >
          ({formatUsd(tokenCost.inputUsd)} / {formatUsd(tokenCost.outputUsd)} /{" "}
          <strong className="font-semibold text-fg">
            {formatUsd(tokenCost.totalUsd)}
          </strong>
          )
        </span>
      ) : null}
    </span>
  );
};

/*
const MetricCard = ({
  hint,
  label,
  value,
}: {
  hint?: string;
  label: string;
  value: React.ReactNode;
}): React.JSX.Element => (
  <div className="rounded border border-border bg-bg-raised p-3">
    <div className="field-label">{label}</div>
    <div className="mt-1 font-semibold text-lg">{value}</div>
    {hint ? <div className="mt-1 text-fg-muted text-xs">{hint}</div> : null}
  </div>
);

const BenchmarkResultsSummary = ({
  runs,
}: {
  runs: BenchmarkRunRow[];
}): React.JSX.Element => {
  const scoredRuns = runs.filter((run) => run.score != null);
  const completedRuns = runs.filter((run) => run.status === "completed");
  const runningRuns = runs.filter(
    (run) => run.status === "pending" || run.status === "running"
  );
  const failedRuns = runs.filter(
    (run) => run.status === "failed" || run.status === "cancelled"
  );
  const avgScore = average(scoredRuns.flatMap((run) => run.score ?? []));
  const vulnRate = booleanRate(
    scoredRuns.map((run) => run.scoreBreakdown?.vulnerableMatched)
  );
  const classRate = booleanRate(
    scoredRuns.map((run) => run.scoreBreakdown?.vulnClassMatched)
  );
  const avgLocationScore = average(
    scoredRuns.flatMap((run) => run.scoreBreakdown?.locationScore ?? [])
  );
  const knownCosts = runs.flatMap((run) => runCost(run) ?? []);
  const knownTokens = runs.flatMap((run) => totalTokenCount(run) ?? []);
  const totalCost = knownCosts.reduce((sum, cost) => sum + cost, 0);
  const totalTokens = knownTokens.reduce((sum, tokens) => sum + tokens, 0);

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        hint={`${completedRuns.length} completed · ${runningRuns.length} active · ${failedRuns.length} stopped`}
        label="runs"
        value={formatNumber(runs.length)}
      />
      <MetricCard
        hint={`${scoredRuns.length} scored run(s)`}
        label="average score"
        value={scoreText(avgScore)}
      />
      <MetricCard
        hint={`vulnerability ${percentText(vulnRate)} · class ${percentText(classRate)}`}
        label="classification"
        value={percentText(
          average(
            [vulnRate, classRate].filter(
              (value): value is number => value != null
            )
          )
        )}
      />
      <MetricCard
        hint={
          knownTokens.length > 0
            ? `${formatNumber(totalTokens)} tokens · ${formatUsd(totalCost)} est.`
            : "token usage appears after sessions complete"
        }
        label="location score"
        value={percentText(avgLocationScore)}
      />
    </div>
  );
};
*/

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
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(BENCHMARK_TAB_IDS).withDefault("results")
  );
  const tasks = useBenchmarkTasksQuery();
  const runs = useBenchmarkRunsQuery();
  const createRun = useCreateBenchmarkRunMutation();
  const [localSelectedRunId, setLocalSelectedRunId] = useState<string | null>(
    null
  );
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("L0");
  const [model, setModel] = useState(DEFAULT_MODEL_VALUE);
  const [batchTaskIds, setBatchTaskIds] = useState<string[]>([]);
  const [batchDifficulties, setBatchDifficulties] = useState<Difficulty[]>([
    "L0",
  ]);
  const [batchModelValues, setBatchModelValues] = useState<string[]>([
    DEFAULT_MODEL_VALUE,
  ]);
  const [batchRepeatCount, setBatchRepeatCount] = useState(
    String(DEFAULT_BATCH_REPEAT_COUNT)
  );
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchRunCount, setBatchRunCount] = useState<number | null>(null);
  const taskOptions = tasks.data?.tasks ?? [];
  const selectedTask = taskOptions.find(
    (task) => task.taskId === selectedTaskId
  );
  const singleRunDifficultyOptions =
    selectedTask?.difficulties ?? DIFFICULTY_OPTIONS;
  const selectedBatchTasks = taskOptions.filter((task) =>
    batchTaskIds.includes(task.taskId)
  );
  const selectedBatchModels = batchModelValues.flatMap((value) => {
    const selectedModel = MODEL_OPTIONS.find(
      (option) => modelValue(option) === value
    );

    return selectedModel
      ? [
          {
            id: selectedModel.id,
            provider: selectedModel.provider,
          },
        ]
      : [];
  });
  const repeatCountNumber = Number(batchRepeatCount);
  const batchPreviewCount =
    Number.isInteger(repeatCountNumber) && repeatCountNumber > 0
      ? selectedBatchModels.length *
        repeatCountNumber *
        selectedBatchTasks.reduce(
          (count, task) =>
            count +
            batchDifficulties.filter((difficultyOption) =>
              task.difficulties.includes(difficultyOption)
            ).length,
          0
        )
      : 0;
  const activeRunId = selectedRunId ?? localSelectedRunId;
  const selectRun = (runId: string): void => {
    setLocalSelectedRunId(runId);
    onSelectRun?.(runId);
  };
  const selectedRun = activeRunId ? (
    <BenchmarkRunDetail
      {...(onOpenSession ? { onOpenSession } : {})}
      onSelectRun={selectRun}
      runId={activeRunId}
    />
  ) : null;

  const startRun = (): void => {
    const selectedModel = MODEL_OPTIONS.find(
      (option) => modelValue(option) === model
    );

    if (
      !(selectedTaskId && selectedModel) ||
      (selectedTask && !selectedTask.difficulties.includes(difficulty))
    ) {
      return;
    }

    createRun.mutate(
      {
        autoStart: true,
        cleanupPolicy: "retain",
        difficulty,
        maxInputTokens: BENCHMARK_MAX_INPUT_TOKENS,
        maxSteps: BENCHMARK_MAX_STEPS,
        maxToolCalls: BENCHMARK_MAX_TOOL_CALLS,
        maxTotalTokens: BENCHMARK_MAX_TOTAL_TOKENS,
        maxTurns: BENCHMARK_MAX_TURNS,
        model: {
          id: selectedModel.id,
          provider: selectedModel.provider,
        },
        taskId: selectedTaskId,
        timeoutSeconds: BENCHMARK_TIMEOUT_SECONDS,
      },
      {
        onSuccess: (response) => selectRun(response.run.id),
      }
    );
  };

  const setBatchDifficulty = (next: Difficulty, checked: boolean): void => {
    setBatchDifficulties((current) =>
      DIFFICULTY_OPTIONS.filter((difficultyOption) =>
        difficultyOption === next ? checked : current.includes(difficultyOption)
      )
    );
  };

  const setBatchModel = (next: string, checked: boolean): void => {
    setBatchModelValues((current) =>
      MODEL_OPTIONS.map((option) => modelValue(option)).filter((modelOption) =>
        modelOption === next ? checked : current.includes(modelOption)
      )
    );
  };

  const startBatch = async (): Promise<void> => {
    setBatchError(null);

    const result = buildBatchRequests({
      difficulties: batchDifficulties,
      models: selectedBatchModels,
      repeatCount: repeatCountNumber,
      tasks: selectedBatchTasks,
    });

    if (result.error || !result.requests) {
      setBatchError(result.error ?? "No benchmark runs were created.");
      return;
    }

    const { requests } = result;
    setBatchRunCount(requests.length);
    try {
      let lastRunId: string | null = null;
      for (const request of requests) {
        const response = await createRun.mutateAsync(request);
        lastRunId = response.run.id;
      }
      if (lastRunId) {
        selectRun(lastRunId);
      }
    } catch (error) {
      setBatchError(
        error instanceof Error ? error.message : "Batch benchmark failed"
      );
    } finally {
      setBatchRunCount(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        actions={
          <AppButton
            onClick={() => setTab(tab === "create" ? "results" : "create")}
            variant="primary"
          >
            {tab === "create" ? (
              <BarChart3 aria-hidden="true" size={12} />
            ) : (
              <Play aria-hidden="true" size={12} />
            )}
            <span>{tab === "create" ? "view results" : "new run"}</span>
          </AppButton>
        }
        description="review benchmark outcomes, agent behavior, and where runs are failing."
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

      <TabsRoot
        onValueChange={(value) => setTab(value as BenchmarkTab)}
        value={tab}
      >
        <TabsList aria-label="benchmark sections" className="tabs">
          <TabsTrigger className="tab" value="results">
            results
          </TabsTrigger>
          <TabsTrigger className="tab" value="create">
            create
          </TabsTrigger>
        </TabsList>

        <TabsContent className="mt-4 space-y-4 outline-none" value="results">
          {/* <BenchmarkResultsSummary runs={runs.data?.runs ?? []} /> */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(500px,1fr)]">
            <BenchmarkRunsTable
              loading={runs.isLoading}
              onSelect={selectRun}
              runs={runs.data?.runs ?? []}
              selectedRunId={activeRunId}
            />
            {selectedRun ?? (
              <Card title="run detail">
                <EmptyState
                  hint="select a run to inspect scoring, agent output, events, and raw payloads."
                  title="no run selected"
                />
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent className="mt-4 space-y-4 outline-none" value="create">
          <Card
            actions={
              <AppButton
                disabled={
                  !enabled || createRun.isPending || batchRunCount !== null
                }
                onClick={startRun}
                variant="primary"
              >
                <Play aria-hidden="true" size={12} />
                <span>
                  {createRun.isPending ? "running…" : "run benchmark"}
                </span>
              </AppButton>
            }
            title="new benchmark run"
          >
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-xs">
                <span className="field-label">task</span>
                <select
                  className="input"
                  onChange={(event) => {
                    const nextTaskId = event.target.value;
                    const nextTask = taskOptions.find(
                      (task) => task.taskId === nextTaskId
                    );

                    setSelectedTaskId(nextTaskId);
                    if (
                      nextTask &&
                      !nextTask.difficulties.includes(difficulty) &&
                      nextTask.difficulties[0]
                    ) {
                      setDifficulty(nextTask.difficulties[0]);
                    }
                  }}
                  value={selectedTaskId}
                >
                  <option value="">select task</option>
                  {taskOptions.map((task) => (
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
                    setDifficulty(event.target.value as Difficulty)
                  }
                  value={difficulty}
                >
                  {singleRunDifficultyOptions.map((difficultyOption) => (
                    <option key={difficultyOption} value={difficultyOption}>
                      {difficultyOption}
                    </option>
                  ))}
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

          <Card
            actions={
              <AppButton
                disabled={
                  !enabled || createRun.isPending || batchRunCount !== null
                }
                onClick={startBatch}
                variant="primary"
              >
                <Play aria-hidden="true" size={12} />
                <span>
                  {batchRunCount === null
                    ? "run batch"
                    : `creating ${batchRunCount} run(s)…`}
                </span>
              </AppButton>
            }
            title="batch benchmark run"
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <label className="space-y-1 text-xs">
                <span className="field-label">tasks</span>
                <select
                  className="input min-h-40 font-mono text-[11px]"
                  multiple
                  onChange={(event) =>
                    setBatchTaskIds(
                      Array.from(
                        event.currentTarget.selectedOptions,
                        (option) => option.value
                      )
                    )
                  }
                  value={batchTaskIds}
                >
                  {taskOptions.map((task) => (
                    <option key={task.taskId} value={task.taskId}>
                      {task.taskId}
                    </option>
                  ))}
                </select>
              </label>
              <div className="space-y-4">
                <fieldset className="space-y-2 text-xs">
                  <legend className="field-label">levels</legend>
                  <div className="flex flex-wrap gap-3">
                    {DIFFICULTY_OPTIONS.map((difficultyOption) => (
                      <label
                        className="flex items-center gap-2"
                        key={difficultyOption}
                      >
                        <input
                          checked={batchDifficulties.includes(difficultyOption)}
                          onChange={(event) =>
                            setBatchDifficulty(
                              difficultyOption,
                              event.currentTarget.checked
                            )
                          }
                          type="checkbox"
                        />
                        <span>{difficultyOption}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="block space-y-1 text-xs">
                  <span className="field-label">
                    times to run each combination
                  </span>
                  <input
                    className="input"
                    min={1}
                    onChange={(event) =>
                      setBatchRepeatCount(event.target.value)
                    }
                    type="number"
                    value={batchRepeatCount}
                  />
                </label>
              </div>
            </div>
            <fieldset className="mt-4 space-y-2 text-xs">
              <legend className="field-label">models</legend>
              <div className="grid gap-2 md:grid-cols-2">
                {MODEL_OPTIONS.map((option) => {
                  const value = modelValue(option);

                  return (
                    <label className="flex items-start gap-2" key={value}>
                      <input
                        checked={batchModelValues.includes(value)}
                        onChange={(event) =>
                          setBatchModel(value, event.currentTarget.checked)
                        }
                        type="checkbox"
                      />
                      <span>
                        {option.label}{" "}
                        <span className="font-mono text-fg-muted">
                          ({option.provider}/{option.id})
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <p className="mt-3 text-fg-muted text-xs">
              This will create {batchPreviewCount} run(s): supported selected
              task/level pairs x models x repeat count. The default selection
              uses only {DEFAULT_MODEL.label}.
            </p>
            {batchError && (
              <div className="error-card mt-3 text-xs" role="alert">
                {batchError}
              </div>
            )}
          </Card>
        </TabsContent>
      </TabsRoot>
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
    {loading && <LoadingState />}
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
            <th
              className="num"
              title="composite; V= vuln, C= class, L= locations"
            >
              score
            </th>
            <th title="input / output / total (USD est.)">tokens</th>
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
              <td className="font-mono text-fg-muted">
                {taskWithDifficulty(run)}
              </td>
              <td>
                <StatusBadge status={badgeStatusForRun(run.status)} />
              </td>
              <td className="num">{scoreColumnForRun(run)}</td>
              <td className="max-w-[14rem] whitespace-normal text-fg-muted text-xs">
                {benchmarkRunTokensLine(run)}
              </td>
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

const BenchmarkRunAgentReview = ({
  result,
  task,
}: {
  result: BenchmarkRunResult | null;
  task: TaskInstance | null;
}): React.JSX.Element => {
  const output = result?.agentOutput;

  return (
    <div className="mb-4 space-y-3 text-xs">
      <div className="field-label">agent behavior</div>
      {!output && (
        <p className="text-fg-muted">
          no parsed agent output yet. Check the raw payload or event timeline
          for parse failures.
        </p>
      )}
      {output && (
        <dl className={BENCHMARK_DL_GRID}>
          <dt className="text-fg-muted">decision</dt>
          <dd>
            vulnerable {formatBool(output.vulnerable)} · class{" "}
            {output.vuln_class ?? "—"} · confidence{" "}
            {percentText(output.confidence)}
          </dd>
          <dt className="text-fg-muted">reason</dt>
          <dd className="whitespace-pre-wrap break-words">
            {output.reason ?? "—"}
          </dd>
          <dt className="text-fg-muted">predicted locs</dt>
          <dd>{formatNumber(output.locations.length)}</dd>
        </dl>
      )}
      {task && (
        <div className="rounded border border-border bg-bg-raised p-3">
          <div className="field-label mb-2">ground truth</div>
          <dl className={BENCHMARK_DL_GRID}>
            <dt className="text-fg-muted">decision</dt>
            <dd>
              vulnerable {formatBool(task.ground_truth.vulnerable)} · class{" "}
              {task.ground_truth.vuln_class}
            </dd>
            <dt className="text-fg-muted">reason</dt>
            <dd className="whitespace-pre-wrap break-words">
              {task.ground_truth.reason}
            </dd>
          </dl>
        </div>
      )}
      {result?.rawOutput ? (
        <details className="rounded border border-border bg-bg-raised p-3">
          <summary className="cursor-pointer text-fg-muted">
            raw agent output
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[11px]">
            {result.rawOutput}
          </pre>
        </details>
      ) : null}
    </div>
  );
};

const BenchmarkRunEventsTimeline = ({
  events,
}: {
  events: BenchmarkRunEvent[];
}): React.JSX.Element => (
  <div className="mb-4 space-y-2 text-xs">
    <div className="field-label">run events</div>
    {events.length === 0 ? (
      <p className="text-fg-muted">no events recorded.</p>
    ) : (
      <ol className="space-y-2">
        {events.map((event) => (
          <li
            className="border-border border-l-2 pl-3"
            key={event.id}
            title={event.createdAt}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{event.kind}</span>
              <span className="text-fg-muted">
                {formatRelativeTime(event.createdAt)}
              </span>
            </div>
            <div className="text-fg-muted">{event.message}</div>
            {event.details == null ? null : (
              <JsonView
                className="mt-2"
                collapsedDepth={1}
                maxHeight={160}
                value={event.details}
              />
            )}
          </li>
        ))}
      </ol>
    )}
  </div>
);

const BenchmarkRunDetail = ({
  onOpenSession,
  onSelectRun,
  runId,
}: {
  onOpenSession?: (sessionId: string) => void;
  onSelectRun?: (runId: string) => void;
  runId: string;
}): React.JSX.Element => {
  const detail = useBenchmarkRunQuery(runId);
  const cancel = useCancelBenchmarkRunMutation(runId);
  const cleanup = useCleanupBenchmarkRunMutation(runId);
  const start = useStartBenchmarkRunMutation(runId);
  const retry = useCreateBenchmarkRunMutation();
  const run = detail.data?.run;
  const canCancel = run?.status === "running";
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
        <div className="flex flex-wrap gap-2">
          <AppButton
            disabled={!canStart || start.isPending}
            onClick={() => start.mutate()}
          >
            <Play aria-hidden="true" size={12} />
            <span>{start.isPending ? "starting…" : "start"}</span>
          </AppButton>
          <AppButton
            disabled={!run || retry.isPending}
            onClick={() => {
              if (!run) {
                return;
              }
              retry.mutate(createBenchmarkRequestFromRun(run), {
                onSuccess: (response) => onSelectRun?.(response.run.id),
              });
            }}
            title="start a new run with the same task, difficulty, model, and cleanup policy"
          >
            <RotateCcw aria-hidden="true" size={12} />
            <span>{retry.isPending ? "retrying…" : "retry"}</span>
          </AppButton>
          <AppButton
            disabled={!canCancel || cancel.isPending}
            onClick={() => cancel.mutate()}
            variant="danger"
          >
            <Square aria-hidden="true" size={12} />
            <span>{cancel.isPending ? "stopping…" : "stop"}</span>
          </AppButton>
          <AppButton
            disabled={cleanup.isPending}
            onClick={() => cleanup.mutate()}
            variant="danger"
          >
            <Trash2 aria-hidden="true" size={12} />
            <span>cleanup</span>
          </AppButton>
        </div>
      }
      title="run detail"
    >
      <ErrorState error={detail.error} title="detail unavailable" />
      <ErrorState error={cancel.error} title="stop failed" />
      <ErrorState error={cleanup.error} title="cleanup failed" />
      <ErrorState error={start.error} title="start failed" />
      <ErrorState error={retry.error} title="retry failed" />
      {!detail.data && <LoadingState />}
      {run && (
        <dl className={cn("mb-4 text-xs", BENCHMARK_DL_GRID)}>
          <DefinitionField label="id" mono>
            {run.id}
          </DefinitionField>
          <DefinitionField label="task" mono>
            {taskWithDifficulty(run)}
          </DefinitionField>
          <DefinitionField label="status">
            <StatusBadge status={badgeStatusForRun(run.status)} />
          </DefinitionField>
          <DefinitionField label="model" mono>
            {run.modelProvider}/{run.modelId}
          </DefinitionField>
          <DefinitionField label="session" mono>
            {sessionValue}
          </DefinitionField>
          <DefinitionField label="tokens (in/out/total)" numeric>
            {benchmarkRunTokensLine(run)}
          </DefinitionField>
          <DefinitionField label="duration" numeric>
            {runDuration(run)}
          </DefinitionField>
          <DefinitionField label="artifact" mono>
            {run.artifactPath ?? "—"}
          </DefinitionField>
          {run.error ? (
            <DefinitionField label="error">{run.error}</DefinitionField>
          ) : null}
        </dl>
      )}
      {run && detail.data && (
        <BenchmarkRunScoringDetail
          locations={detail.data.locations}
          result={detail.data.result}
          run={run}
          task={detail.data.task}
        />
      )}
      {detail.data && (
        <BenchmarkRunAgentReview
          result={detail.data.result}
          task={detail.data.task}
        />
      )}
      {detail.data && (
        <BenchmarkRunEventsTimeline events={detail.data.events} />
      )}
      {detail.data && <JsonView maxHeight={420} value={detail.data} />}
    </Card>
  );
};
