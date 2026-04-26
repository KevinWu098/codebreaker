import type {
  BenchmarkRunRow,
  BenchmarkTaskSummary,
  Difficulty,
} from "@codebreaker/benchmark-runner/schemas";
import { estimateTokenUsageCost } from "@codebreaker/shared/lib/models";
import { ChevronDown, ChevronRight, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import {
  useBenchmarkTasksQuery,
  useComparisonRunsQuery,
  useLeaderboardRunsQuery,
} from "@/hooks/queries";
import {
  formatDuration,
  formatNumber,
  formatRelativeTime,
  formatUsd,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type CompareMode = "task" | "matrix" | "leaderboard";

const DIFFICULTIES: readonly Difficulty[] = ["L0", "L1", "L2", "L3"];

const average = (values: number[]): number | null => {
  if (values.length === 0) {
    return null;
  }
  let total = 0;
  for (const v of values) {
    total += v;
  }
  return total / values.length;
};

const booleanRate = (
  values: Array<boolean | null | undefined>
): number | null => {
  const known = values.filter((v): v is boolean => v != null);
  if (known.length === 0) {
    return null;
  }
  let matches = 0;
  for (const v of known) {
    if (v) {
      matches += 1;
    }
  }
  return matches / known.length;
};

const pct = (value: number | null): string =>
  value == null ? "—" : `${Math.round(value * 100)}%`;

const scoreCell = (value: number | null): string =>
  value == null ? "—" : value.toFixed(2);

const totalTokens = (run: BenchmarkRunRow): number | null => {
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

const runDurationMs = (run: BenchmarkRunRow): number | null => {
  if (!run.completedAt) {
    return null;
  }
  const started = new Date(run.createdAt).getTime();
  const completed = new Date(run.completedAt).getTime();
  if (Number.isNaN(started) || Number.isNaN(completed)) {
    return null;
  }
  return Math.max(0, completed - started);
};

interface ModelKey {
  harnessMode: "full" | "minimal";
  modelId: string;
  modelProvider: string;
}

const modelLabel = (m: ModelKey): string =>
  m.harnessMode === "full"
    ? `${m.modelProvider}/${m.modelId} (harnessed)`
    : `${m.modelProvider}/${m.modelId}`;

const runModelKey = (run: BenchmarkRunRow): string =>
  `${run.modelProvider}/${run.modelId}:${run.harnessMode}`;

interface ModelGroup {
  allRuns: BenchmarkRunRow[];
  best: BenchmarkRunRow;
}

const groupByModel = (runs: BenchmarkRunRow[]): ModelGroup[] => {
  const byModel = new Map<string, BenchmarkRunRow[]>();
  for (const run of runs) {
    const key = runModelKey(run);
    const group = byModel.get(key) ?? [];
    group.push(run);
    byModel.set(key, group);
  }

  const groups: ModelGroup[] = [];
  for (const [, allRuns] of byModel) {
    let best = allRuns[0];
    if (!best) {
      continue;
    }
    for (const run of allRuns) {
      if ((run.score ?? -1) > (best.score ?? -1)) {
        best = run;
      }
    }
    allRuns.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    groups.push({ allRuns, best });
  }

  groups.sort((a, b) => (b.best.score ?? -1) - (a.best.score ?? -1));
  return groups;
};

interface LeaderboardRow {
  avgLocationScore: number | null;
  avgScore: number | null;
  classMatchRate: number | null;
  model: ModelKey;
  runCount: number;
  totalCost: number;
  totalTokens: number;
}

const buildLeaderboard = (runs: BenchmarkRunRow[]): LeaderboardRow[] => {
  const byModel = new Map<string, BenchmarkRunRow[]>();
  for (const run of runs) {
    const key = runModelKey(run);
    const group = byModel.get(key) ?? [];
    group.push(run);
    byModel.set(key, group);
  }

  const rows: LeaderboardRow[] = [];
  for (const [, group] of byModel) {
    const first = group[0];
    if (!first) {
      continue;
    }
    const scored = group.filter((r) => r.score != null);
    rows.push({
      avgLocationScore: average(
        scored.flatMap((r) => r.scoreBreakdown?.locationScore ?? [])
      ),
      avgScore: average(scored.flatMap((r) => r.score ?? [])),
      classMatchRate: booleanRate(
        scored.map((r) => r.scoreBreakdown?.vulnClassMatched)
      ),
      model: {
        harnessMode: first.harnessMode,
        modelId: first.modelId,
        modelProvider: first.modelProvider,
      },
      runCount: group.length,
      totalCost: group
        .flatMap((r) => runCost(r) ?? [])
        .reduce((s, c) => s + c, 0),
      totalTokens: group
        .flatMap((r) => totalTokens(r) ?? [])
        .reduce((s, t) => s + t, 0),
    });
  }

  rows.sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1));
  return rows;
};

const TH =
  "whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted";
const TD = "whitespace-nowrap px-3 py-2 text-sm";

const vulnGateLabel = (matched: boolean | null | undefined): string => {
  if (matched == null) {
    return "—";
  }
  return matched ? "pass" : "fail";
};

const classMatchLabel = (matched: boolean | null | undefined): string => {
  if (matched == null) {
    return "—";
  }
  return matched ? "match" : "miss";
};

export interface CompareTabProps {
  onSelectRun?: ((runId: string) => void) | undefined;
}

export const CompareTab = ({
  onSelectRun,
}: CompareTabProps): React.JSX.Element => {
  const [mode, setMode] = useState<CompareMode>("matrix");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <ModeButton
          active={mode === "matrix"}
          label="all tasks"
          onClick={() => setMode("matrix")}
        />
        <ModeButton
          active={mode === "task"}
          label="single task"
          onClick={() => setMode("task")}
        />
        <ModeButton
          active={mode === "leaderboard"}
          label="leaderboard"
          onClick={() => setMode("leaderboard")}
        />
      </div>

      {mode === "matrix" && <MatrixView onSelectRun={onSelectRun} />}
      {mode === "task" && <TaskComparisonView onSelectRun={onSelectRun} />}
      {mode === "leaderboard" && <LeaderboardView />}
    </div>
  );
};

const ModeButton = ({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}): React.JSX.Element => (
  <button
    className={cn(
      "rounded-md px-3 py-1.5 font-medium text-xs transition-colors",
      active
        ? "bg-bg-raised text-fg ring-1 ring-border"
        : "text-fg-muted hover:text-fg"
    )}
    onClick={onClick}
    type="button"
  >
    {label}
  </button>
);

const RunRow = ({
  indent,
  isBest,
  onSelect,
  run,
}: {
  indent?: boolean | undefined;
  isBest: boolean;
  onSelect?: ((runId: string) => void) | undefined;
  run: BenchmarkRunRow;
}): React.JSX.Element => {
  const dur = runDurationMs(run);
  const cost = runCost(run);
  const tokens = totalTokens(run);

  return (
    <tr
      className={cn(
        "border-border/50 border-b transition-colors",
        isBest && !indent && "bg-bg-raised/60",
        onSelect && "cursor-pointer hover:bg-bg-raised/80",
        indent && "text-fg-muted"
      )}
      onClick={() => onSelect?.(run.id)}
    >
      <td className={TD}>
        <div className={cn("flex items-center gap-1.5", indent && "pl-6")}>
          {isBest && !indent && (
            <Trophy
              aria-label="best score"
              className="text-yellow-500"
              size={13}
            />
          )}
          <span className={indent ? "" : "font-medium"}>
            {indent
              ? run.id.slice(0, 8)
              : `${run.modelProvider}/${run.modelId}`}
          </span>
        </div>
      </td>
      <td
        className={cn(
          TD,
          "tabular-nums",
          isBest && !indent && "font-semibold text-green-400"
        )}
      >
        {scoreCell(run.score)}
      </td>
      <td className={TD}>
        {vulnGateLabel(run.scoreBreakdown?.vulnerableMatched)}
      </td>
      <td className={TD}>
        {classMatchLabel(run.scoreBreakdown?.vulnClassMatched)}
      </td>
      <td className={cn(TD, "tabular-nums")}>
        {pct(run.scoreBreakdown?.locationScore ?? null)}
      </td>
      <td className={cn(TD, "text-fg-muted tabular-nums")}>
        {tokens == null ? "—" : formatNumber(tokens)}
      </td>
      <td className={cn(TD, "text-fg-muted tabular-nums")}>
        {cost == null ? "—" : formatUsd(cost)}
      </td>
      <td className={cn(TD, "text-fg-muted tabular-nums")}>
        {dur == null ? "—" : formatDuration(dur)}
      </td>
      <td className={cn(TD, "text-fg-muted")}>
        {formatRelativeTime(run.createdAt)}
      </td>
    </tr>
  );
};

const ModelGroupRows = ({
  group,
  isBest,
  onSelect,
}: {
  group: ModelGroup;
  isBest: boolean;
  onSelect?: ((runId: string) => void) | undefined;
}): React.JSX.Element => {
  const [expanded, setExpanded] = useState(false);
  const hasMultiple = group.allRuns.length > 1;

  return (
    <>
      <tr
        className={cn(
          "border-border/50 border-b transition-colors",
          isBest && "bg-bg-raised/60",
          "cursor-pointer hover:bg-bg-raised/80"
        )}
        onClick={() => {
          if (hasMultiple) {
            setExpanded((prev) => !prev);
          } else {
            onSelect?.(group.best.id);
          }
        }}
      >
        <td className={TD}>
          <ModelCell
            expanded={expanded}
            group={group}
            hasMultiple={hasMultiple}
            isBest={isBest}
          />
        </td>
        <ScoreCells isBest={isBest} run={group.best} />
        <td className={cn(TD, "text-fg-muted")}>
          {formatRelativeTime(group.best.createdAt)}
        </td>
      </tr>
      {expanded &&
        group.allRuns.map((run) => (
          <RunRow
            indent
            isBest={false}
            key={run.id}
            onSelect={onSelect}
            run={run}
          />
        ))}
    </>
  );
};

const ModelCell = ({
  expanded,
  group,
  hasMultiple,
  isBest,
}: {
  expanded: boolean;
  group: ModelGroup;
  hasMultiple: boolean;
  isBest: boolean;
}): React.JSX.Element => (
  <div className="flex items-center gap-1.5">
    {isBest && (
      <Trophy aria-label="best score" className="text-yellow-500" size={13} />
    )}
    {hasMultiple &&
      (expanded ? (
        <ChevronDown className="text-fg-muted" size={12} />
      ) : (
        <ChevronRight className="text-fg-muted" size={12} />
      ))}
    <span className="font-medium">
      {group.best.modelProvider}/{group.best.modelId}
    </span>
    {hasMultiple && (
      <span className="text-[10px] text-fg-muted">
        ({group.allRuns.length} runs)
      </span>
    )}
  </div>
);

const ScoreCells = ({
  isBest,
  run,
}: {
  isBest: boolean;
  run: BenchmarkRunRow;
}): React.JSX.Element => {
  const dur = runDurationMs(run);
  const cost = runCost(run);
  const tokens = totalTokens(run);

  return (
    <>
      <td
        className={cn(
          TD,
          "tabular-nums",
          isBest && "font-semibold text-green-400"
        )}
      >
        {scoreCell(run.score)}
      </td>
      <td className={TD}>
        {vulnGateLabel(run.scoreBreakdown?.vulnerableMatched)}
      </td>
      <td className={TD}>
        {classMatchLabel(run.scoreBreakdown?.vulnClassMatched)}
      </td>
      <td className={cn(TD, "tabular-nums")}>
        {pct(run.scoreBreakdown?.locationScore ?? null)}
      </td>
      <td className={cn(TD, "text-fg-muted tabular-nums")}>
        {tokens == null ? "—" : formatNumber(tokens)}
      </td>
      <td className={cn(TD, "text-fg-muted tabular-nums")}>
        {cost == null ? "—" : formatUsd(cost)}
      </td>
      <td className={cn(TD, "text-fg-muted tabular-nums")}>
        {dur == null ? "—" : formatDuration(dur)}
      </td>
    </>
  );
};

const ComparisonTableHead = (): React.JSX.Element => (
  <thead>
    <tr className="border-border border-b">
      <th className={TH}>model</th>
      <th className={TH}>score</th>
      <th className={TH}>vuln gate</th>
      <th className={TH}>class match</th>
      <th className={TH}>location score</th>
      <th className={TH}>tokens</th>
      <th className={TH}>cost</th>
      <th className={TH}>duration</th>
      <th className={TH}>ran</th>
    </tr>
  </thead>
);

const TaskComparisonView = ({
  onSelectRun,
}: {
  onSelectRun?: ((runId: string) => void) | undefined;
}): React.JSX.Element => {
  const tasks = useBenchmarkTasksQuery();
  const taskList: BenchmarkTaskSummary[] = tasks.data?.tasks ?? [];

  const [selectedTask, setSelectedTask] = useState<string>("");
  const [selectedDifficulty, setSelectedDifficulty] =
    useState<Difficulty>("L0");

  const comparison = useComparisonRunsQuery({
    difficulty: selectedDifficulty,
    taskId: selectedTask,
  });

  const allRuns = comparison.data ?? [];
  const groups = useMemo(() => groupByModel(allRuns), [allRuns]);
  const topScore = groups.length > 0 ? (groups[0]?.best.score ?? null) : null;

  return (
    <Card title="single task comparison">
      <div className="mb-4 flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-fg-muted text-xs">task</span>
          <select
            className="rounded-md border border-border bg-bg-raised px-2 py-1.5 text-fg text-sm"
            onChange={(e) => setSelectedTask(e.target.value)}
            value={selectedTask}
          >
            <option value="">select a task...</option>
            {taskList.map((t) => (
              <option key={t.taskId} value={t.taskId}>
                {t.taskId}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-fg-muted text-xs">difficulty</span>
          <select
            className="rounded-md border border-border bg-bg-raised px-2 py-1.5 text-fg text-sm"
            onChange={(e) =>
              setSelectedDifficulty(e.target.value as Difficulty)
            }
            value={selectedDifficulty}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!selectedTask && (
        <EmptyState
          hint="pick a task and difficulty above to compare how different models performed."
          title="select a task to compare"
        />
      )}

      {selectedTask && comparison.isPending && <Spinner />}

      {selectedTask && !comparison.isPending && groups.length === 0 && (
        <EmptyState
          hint="no completed runs match this task and difficulty combination."
          title="no results"
        />
      )}

      {groups.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <ComparisonTableHead />
            <tbody>
              {groups.map((group) => (
                <ModelGroupRows
                  group={group}
                  isBest={topScore !== null && group.best.score === topScore}
                  key={modelLabel(group.best)}
                  onSelect={onSelectRun}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

const SORT_OPTIONS = ["task", "vuln class"] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

const MatrixView = ({
  onSelectRun,
}: {
  onSelectRun?: ((runId: string) => void) | undefined;
}): React.JSX.Element => {
  const [difficulty, setDifficulty] = useState<Difficulty>("L0");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("task");

  const allRuns = useLeaderboardRunsQuery(difficulty ? { difficulty } : {});
  const tasks = useBenchmarkTasksQuery();
  const taskList: BenchmarkTaskSummary[] = tasks.data?.tasks ?? [];
  const runs = allRuns.data ?? [];

  const taskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of runs) {
      ids.add(run.taskId);
    }
    return [...ids].sort();
  }, [runs]);

  const models = useMemo(() => {
    const map = new Map<string, ModelKey>();
    for (const run of runs) {
      const key = runModelKey(run);
      if (!map.has(key)) {
        map.set(key, {
          harnessMode: run.harnessMode,
          modelId: run.modelId,
          modelProvider: run.modelProvider,
        });
      }
    }
    return [...map.values()].sort((a, b) => {
      const aHarnessed = a.harnessMode === "full";
      const bHarnessed = b.harnessMode === "full";
      if (aHarnessed && !bHarnessed) {
        return -1;
      }
      if (!aHarnessed && bHarnessed) {
        return 1;
      }
      const aKimi = a.modelProvider === "kimi";
      const bKimi = b.modelProvider === "kimi";
      if (aKimi && !bKimi) {
        return -1;
      }
      if (!aKimi && bKimi) {
        return 1;
      }
      return modelLabel(a).localeCompare(modelLabel(b));
    });
  }, [runs]);

  const bestByTaskModel = useMemo(() => {
    const map = new Map<string, BenchmarkRunRow>();
    for (const run of runs) {
      const key = `${run.taskId}\0${runModelKey(run)}`;
      const existing = map.get(key);
      if (!existing || (run.score ?? -1) > (existing.score ?? -1)) {
        map.set(key, run);
      }
    }
    return map;
  }, [runs]);

  const bestScoreByTask = useMemo(() => {
    const map = new Map<string, number>();
    for (const [, run] of bestByTaskModel) {
      const current = map.get(run.taskId) ?? -1;
      if ((run.score ?? -1) > current) {
        map.set(run.taskId, run.score ?? -1);
      }
    }
    return map;
  }, [bestByTaskModel]);

  const taskMeta = useMemo(() => {
    const map = new Map<string, BenchmarkTaskSummary>();
    for (const t of taskList) {
      map.set(t.taskId, t);
    }
    return map;
  }, [taskList]);

  const lowerSearch = search.toLowerCase();
  const filteredTaskIds = useMemo(() => {
    const filtered = lowerSearch
      ? taskIds.filter((id) => id.toLowerCase().includes(lowerSearch))
      : [...taskIds];

    if (sortBy === "vuln class") {
      filtered.sort((a, b) => {
        const classA = taskMeta.get(a)?.vulnClass ?? "";
        const classB = taskMeta.get(b)?.vulnClass ?? "";
        const cmp = classA.localeCompare(classB);
        if (cmp !== 0) {
          return cmp;
        }
        return a.localeCompare(b);
      });
    }

    return filtered;
  }, [taskIds, lowerSearch, sortBy, taskMeta]);

  return (
    <Card
      actions={
        <div className="flex items-center gap-1.5">
          <input
            className="rounded-md border border-border/60 bg-bg-raised/60 px-2.5 py-1 text-fg text-xs placeholder:text-fg-muted/60 focus:border-border focus:outline-none"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search tasks..."
            type="text"
            value={search}
          />
          <select
            className="rounded-md border border-border/60 bg-bg-raised/60 px-2 py-1 text-fg text-xs"
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            value={sortBy}
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s} value={s}>
                sort: {s}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border border-border/60 bg-bg-raised/60 px-2 py-1 text-fg text-xs"
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
            value={difficulty}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      }
      title={`all tasks — ${difficulty}`}
    >
      {allRuns.isPending && <Spinner />}

      {!allRuns.isPending && filteredTaskIds.length === 0 && (
        <EmptyState
          hint={
            search
              ? "no tasks match your search."
              : "no completed runs at this difficulty."
          }
          title="no results"
        />
      )}

      {filteredTaskIds.length > 0 && models.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full text-left">
            <thead>
              <tr className="border-border/60 border-b bg-bg-raised/40">
                <th
                  className={cn(
                    TH,
                    "sticky left-0 z-10 max-w-[140px] bg-bg-raised/40"
                  )}
                >
                  task
                </th>
                <th
                  className={cn(
                    TH,
                    "sticky left-0 z-10 max-w-[80px] bg-bg-raised/40"
                  )}
                >
                  vuln class
                </th>
                {models.map((m) => {
                  const key = `${m.modelProvider}/${m.modelId}:${m.harnessMode}`;
                  const shortName =
                    m.harnessMode === "full" ? `${m.modelId} (H)` : m.modelId;
                  return (
                    <th
                      className={cn(TH, "text-center")}
                      key={key}
                      title={modelLabel(m)}
                    >
                      {shortName}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {filteredTaskIds.map((taskId, idx) => {
                const meta = taskMeta.get(taskId);
                return (
                  <MatrixRow
                    bestByTaskModel={bestByTaskModel}
                    bestScore={bestScoreByTask.get(taskId) ?? -1}
                    even={idx % 2 === 0}
                    key={taskId}
                    meta={meta}
                    models={models}
                    onSelectRun={onSelectRun}
                    taskId={taskId}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

const MatrixRow = ({
  bestByTaskModel,
  bestScore,
  even,
  meta,
  models,
  onSelectRun,
  taskId,
}: {
  bestByTaskModel: Map<string, BenchmarkRunRow>;
  bestScore: number;
  even: boolean;
  meta?: BenchmarkTaskSummary | undefined;
  models: ModelKey[];
  onSelectRun?: ((runId: string) => void) | undefined;
  taskId: string;
}): React.JSX.Element => (
  <tr
    className={cn(
      "transition-colors hover:bg-bg-raised/60",
      even ? "bg-transparent" : "bg-bg-raised/20"
    )}
  >
    <td
      className={cn(
        TD,
        "sticky left-0 z-10 max-w-[140px] truncate font-medium text-xs",
        even ? "bg-bg" : "bg-bg-raised/20"
      )}
      title={taskId}
    >
      {taskId.replace("ecvebench-", "")}
    </td>
    <td
      className={cn(
        TD,
        "sticky left-0 z-10 max-w-[80px] truncate text-fg-muted text-xs",
        even ? "bg-bg" : "bg-bg-raised/20"
      )}
      title={meta?.vulnClass}
    >
      {meta?.vulnClass ?? "—"}
    </td>
    {models.map((m) => {
      const mKey = `${m.modelProvider}/${m.modelId}:${m.harnessMode}`;
      const run = bestByTaskModel.get(`${taskId}\0${mKey}`);
      if (!run) {
        return (
          <td className={cn(TD, "text-center text-fg-muted/50")} key={mKey}>
            —
          </td>
        );
      }
      const isWinner =
        run.score != null && bestScore >= 0 && run.score >= bestScore;
      return (
        <MatrixCell
          isBest={isWinner}
          key={mKey}
          onSelectRun={onSelectRun}
          run={run}
        />
      );
    })}
  </tr>
);

const scoreColor = (score: number): string => {
  if (score >= 0.9) {
    return "text-green-400";
  }
  if (score >= 0.5) {
    return "text-yellow-400";
  }
  if (score > 0) {
    return "text-orange-400";
  }
  return "text-red-400";
};

const matrixCellColor = (isBest: boolean, score: number | null): string => {
  if (isBest) {
    return "font-bold text-green-400";
  }
  if (score == null) {
    return "text-fg-muted";
  }
  return scoreColor(score);
};

const MatrixCell = ({
  isBest,
  onSelectRun,
  run,
}: {
  isBest: boolean;
  onSelectRun?: ((runId: string) => void) | undefined;
  run: BenchmarkRunRow;
}): React.JSX.Element => (
  <td className={cn(TD, "p-0 text-center", isBest && "bg-green-500/8")}>
    <button
      className={cn(
        "w-full px-3 py-2 tabular-nums transition-colors hover:bg-bg-raised/60",
        matrixCellColor(isBest, run.score ?? null)
      )}
      onClick={() => onSelectRun?.(run.id)}
      title={[
        `score: ${scoreCell(run.score)}`,
        `vuln gate: ${vulnGateLabel(run.scoreBreakdown?.vulnerableMatched)}`,
        `class: ${classMatchLabel(run.scoreBreakdown?.vulnClassMatched)}`,
        `location: ${pct(run.scoreBreakdown?.locationScore ?? null)}`,
        `ran: ${formatRelativeTime(run.createdAt)}`,
      ].join("\n")}
      type="button"
    >
      {scoreCell(run.score)}
    </button>
  </td>
);

const CHART_ROW_HEIGHT = 26;
const CHART_ROW_GAP = 8;
const CHART_PADDING_X = 12;
const CHART_PADDING_TOP = 12;
const CHART_AXIS_HEIGHT = 22;
const CHART_LABEL_WIDTH = 200;
const CHART_VALUE_WIDTH = 72;
const CHART_WIDTH = 640;
const CHART_TICKS = [0, 0.25, 0.5, 0.75, 1] as const;
const MAX_LABEL_CHARS = 28;

const truncateLabel = (label: string): string =>
  label.length > MAX_LABEL_CHARS
    ? `${label.slice(0, MAX_LABEL_CHARS - 1)}…`
    : label;

const LeaderboardChart = ({
  rows,
}: {
  rows: LeaderboardRow[];
}): React.JSX.Element => {
  const barAreaWidth =
    CHART_WIDTH - CHART_LABEL_WIDTH - CHART_VALUE_WIDTH - CHART_PADDING_X * 2;
  const rowsHeight =
    rows.length * CHART_ROW_HEIGHT +
    Math.max(0, rows.length - 1) * CHART_ROW_GAP;
  const height = CHART_PADDING_TOP + rowsHeight + CHART_AXIS_HEIGHT;
  const axisY = CHART_PADDING_TOP + rowsHeight + 4;
  const barLeft = CHART_PADDING_X + CHART_LABEL_WIDTH;

  return (
    <div className="overflow-x-auto pb-1">
      <svg
        aria-label="model average score chart"
        className="block"
        height={height}
        role="img"
        viewBox={`0 0 ${CHART_WIDTH} ${height}`}
        width={CHART_WIDTH}
      >
        <title>average score by model</title>
        {CHART_TICKS.map((tick) => {
          const x = barLeft + tick * barAreaWidth;
          const isEdge = tick === 0 || tick === 1;
          return (
            <g key={tick}>
              <line
                stroke="rgb(var(--border))"
                strokeDasharray={isEdge ? undefined : "2 3"}
                x1={x}
                x2={x}
                y1={CHART_PADDING_TOP - 4}
                y2={axisY - 2}
              />
              <text
                fill="rgb(var(--fg-muted))"
                fontSize={9}
                textAnchor="middle"
                x={x}
                y={axisY + 12}
              >
                {`${Math.round(tick * 100)}%`}
              </text>
            </g>
          );
        })}
        {rows.map((row, idx) => {
          const score = row.avgScore ?? 0;
          const classRate = row.classMatchRate;
          const y =
            CHART_PADDING_TOP + idx * (CHART_ROW_HEIGHT + CHART_ROW_GAP);
          const barWidth = Math.max(0, score * barAreaWidth);
          const isTop = idx === 0;
          const fill = isTop
            ? "rgb(74 222 128 / 0.85)"
            : "rgb(var(--accent) / 0.7)";
          const label = modelLabel(row.model);
          return (
            <g key={label}>
              <text
                fill="rgb(var(--fg))"
                fontSize={11}
                x={CHART_PADDING_X}
                y={y + CHART_ROW_HEIGHT / 2 + 4}
              >
                {truncateLabel(label)}
              </text>
              <rect
                fill="rgb(var(--bg-raised))"
                height={CHART_ROW_HEIGHT}
                rx={3}
                stroke="rgb(var(--border))"
                width={barAreaWidth}
                x={barLeft}
                y={y}
              />
              <rect
                fill={fill}
                height={CHART_ROW_HEIGHT}
                rx={3}
                width={barWidth}
                x={barLeft}
                y={y}
              >
                <title>
                  {`${label} • avg score ${score.toFixed(2)} • runs ${row.runCount}`}
                </title>
              </rect>
              {classRate != null && (
                <line
                  stroke="rgb(var(--fg))"
                  strokeWidth={2}
                  x1={barLeft + classRate * barAreaWidth}
                  x2={barLeft + classRate * barAreaWidth}
                  y1={y + 3}
                  y2={y + CHART_ROW_HEIGHT - 3}
                >
                  <title>{`class match ${pct(classRate)}`}</title>
                </line>
              )}
              <text
                fill="rgb(var(--fg))"
                fontSize={11}
                fontWeight={600}
                textAnchor="end"
                x={CHART_WIDTH - CHART_PADDING_X}
                y={y + CHART_ROW_HEIGHT / 2 + 4}
              >
                {scoreCell(row.avgScore)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-3 px-3 text-[10px] text-fg-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-green-400/85" />
          top model
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-accent/70" />
          avg score
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-[2px] bg-fg" />
          class match rate
        </span>
      </div>
    </div>
  );
};

const LeaderboardView = (): React.JSX.Element => {
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const leaderboard = useLeaderboardRunsQuery(difficulty ? { difficulty } : {});

  const rows = buildLeaderboard(leaderboard.data ?? []);

  return (
    <Card
      actions={
        <select
          className="rounded-md border border-border bg-bg-raised px-2 py-1 text-fg text-xs"
          onChange={(e) => setDifficulty(e.target.value as Difficulty | "")}
          value={difficulty}
        >
          <option value="">all difficulties</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      }
      title="model leaderboard"
    >
      {leaderboard.isPending && <Spinner />}

      {!leaderboard.isPending && rows.length === 0 && (
        <EmptyState
          hint="run some benchmarks to see aggregate model performance here."
          title="no completed runs"
        />
      )}

      {rows.length > 0 && (
        <div className="space-y-4">
          <LeaderboardChart rows={rows} />
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-border border-b">
                  <th className={TH}>#</th>
                  <th className={TH}>model</th>
                  <th className={TH}>runs</th>
                  <th className={TH}>avg score</th>
                  <th className={TH}>class match</th>
                  <th className={TH}>avg location</th>
                  <th className={TH}>total tokens</th>
                  <th className={TH}>total cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    className={cn(
                      "border-border/50 border-b",
                      idx === 0 && "bg-bg-raised/60"
                    )}
                    key={modelLabel(row.model)}
                  >
                    <td className={cn(TD, "text-fg-muted")}>
                      <div className="flex items-center gap-1">
                        {idx === 0 && (
                          <Trophy
                            aria-label="top model"
                            className="text-yellow-500"
                            size={13}
                          />
                        )}
                        {idx + 1}
                      </div>
                    </td>
                    <td className={cn(TD, "font-medium")}>
                      {modelLabel(row.model)}
                    </td>
                    <td className={cn(TD, "tabular-nums")}>{row.runCount}</td>
                    <td
                      className={cn(
                        TD,
                        "font-semibold tabular-nums",
                        idx === 0 && "text-green-400"
                      )}
                    >
                      {scoreCell(row.avgScore)}
                    </td>
                    <td className={cn(TD, "tabular-nums")}>
                      {pct(row.classMatchRate)}
                    </td>
                    <td className={cn(TD, "tabular-nums")}>
                      {pct(row.avgLocationScore)}
                    </td>
                    <td className={cn(TD, "text-fg-muted tabular-nums")}>
                      {row.totalTokens > 0
                        ? formatNumber(row.totalTokens)
                        : "—"}
                    </td>
                    <td className={cn(TD, "text-fg-muted tabular-nums")}>
                      {row.totalCost > 0 ? formatUsd(row.totalCost) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
};
