import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useCallback } from "react";
import { Sidebar, type ViewId } from "@/components/sidebar";
import { AdminPanel } from "@/features/admin/admin-panel";
import { BenchmarksPanel } from "@/features/benchmarks/benchmarks-panel";
import { FollowupsPanel } from "@/features/followups/followups-panel";
import { SessionDetail } from "@/features/sessions/session-detail";
import { SessionsList } from "@/features/sessions/sessions-list";
import { useThemeSync } from "@/hooks/use-theme";

const VIEW_IDS: readonly ViewId[] = [
  "sessions",
  "benchmarks",
  "followups",
  "admin",
];

const searchParams = {
  benchmark: parseAsString,
  followupRun: parseAsString,
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
    {
      benchmark: selectedBenchmarkId,
      followupRun: followupSelectedRunId,
      view,
      session: selectedId,
    },
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
            setParams({ followupRun: null, view: next });
          } else if (next === "followups") {
            setParams({
              benchmark: null,
              session: null,
              tab: null,
              view: next,
            });
          } else {
            setParams({
              followupRun: null,
              session: null,
              tab: null,
              view: next,
            });
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
            onOpenFollowupRun={(runId) =>
              setParams(
                {
                  benchmark: null,
                  followupRun: runId,
                  session: null,
                  tab: null,
                  view: "followups",
                },
                { history: "push" }
              )
            }
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
        {view === "followups" && (
          <FollowupsPanel
            onOpenBenchmarkRun={(runId) =>
              setParams(
                {
                  benchmark: runId,
                  followupRun: null,
                  session: null,
                  tab: null,
                  view: "benchmarks",
                },
                { history: "push" }
              )
            }
            onSelectRun={(runId) =>
              setParams({ followupRun: runId }, { history: "push" })
            }
            selectedRunId={followupSelectedRunId}
          />
        )}
        {view === "admin" && <AdminPanel />}
      </main>
    </div>
  );
};
