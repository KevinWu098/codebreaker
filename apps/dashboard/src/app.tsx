import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useCallback } from "react";
import { Sidebar, type ViewId } from "@/components/sidebar";
import { AdminPanel } from "@/features/admin/admin-panel";
import { BenchmarksPanel } from "@/features/benchmarks/benchmarks-panel";
import { SessionDetail } from "@/features/sessions/session-detail";
import { SessionsList } from "@/features/sessions/sessions-list";
import { useThemeSync } from "@/hooks/use-theme";

const VIEW_IDS: readonly ViewId[] = ["sessions", "benchmarks", "admin"];

const searchParams = {
  benchmark: parseAsString,
  view: parseAsStringLiteral(VIEW_IDS).withDefault("sessions"),
  session: parseAsString,
  tab: parseAsString,
};

interface SessionsViewProps {
  onClearSelection: () => void;
  onOpenBenchmarkRun: (runId: string) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}

const SessionsView = ({
  onClearSelection,
  onOpenBenchmarkRun,
  onSelect,
  selectedId,
}: SessionsViewProps): React.JSX.Element => {
  if (selectedId) {
    return (
      <SessionDetail
        key={selectedId}
        onArchived={onClearSelection}
        onBack={onClearSelection}
        onOpenBenchmarkRun={onOpenBenchmarkRun}
        sessionId={selectedId}
      />
    );
  }

  return (
    <SessionsList
      onOpenBenchmarkRun={onOpenBenchmarkRun}
      onSelect={onSelect}
      selectedId={selectedId}
    />
  );
};

export const App = (): React.JSX.Element => {
  useThemeSync();
  const [
    { benchmark: selectedBenchmarkId, view, session: selectedId },
    setParams,
  ] = useQueryStates(searchParams);

  const clearSelection = useCallback(
    () => setParams({ session: null, tab: null }),
    [setParams]
  );

  return (
    <div className="app-shell">
      <Sidebar
        onSelectView={(next) => {
          if (next === "sessions") {
            setParams({ view: next });
          } else {
            setParams({ view: next, session: null, tab: null });
          }
        }}
        view={view}
      />

      <main className="page">
        {view === "sessions" && (
          <SessionsView
            onClearSelection={clearSelection}
            onOpenBenchmarkRun={(runId) =>
              setParams(
                {
                  benchmark: runId,
                  session: null,
                  tab: null,
                  view: "benchmarks",
                },
                { history: "push" }
              )
            }
            onSelect={(id) =>
              setParams({ session: id, tab: null }, { history: "push" })
            }
            selectedId={selectedId}
          />
        )}
        {view === "benchmarks" && (
          <BenchmarksPanel
            onOpenSession={(sessionId) =>
              setParams(
                { view: "sessions", session: sessionId, tab: null },
                { history: "push" }
              )
            }
            onSelectRun={(runId) =>
              setParams({ benchmark: runId }, { history: "push" })
            }
            selectedRunId={selectedBenchmarkId}
          />
        )}
        {view === "admin" && <AdminPanel />}
      </main>
    </div>
  );
};
