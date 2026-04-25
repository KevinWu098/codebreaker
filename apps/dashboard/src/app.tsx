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
  view: parseAsStringLiteral(VIEW_IDS).withDefault("sessions"),
  session: parseAsString,
  tab: parseAsString,
};

interface SessionsViewProps {
  onClearSelection: () => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}

const SessionsView = ({
  onClearSelection,
  onSelect,
  selectedId,
}: SessionsViewProps): React.JSX.Element => {
  if (selectedId) {
    return (
      <SessionDetail
        key={selectedId}
        onArchived={onClearSelection}
        onBack={onClearSelection}
        sessionId={selectedId}
      />
    );
  }

  return <SessionsList onSelect={onSelect} selectedId={selectedId} />;
};

export const App = (): React.JSX.Element => {
  useThemeSync();
  const [{ view, session: selectedId }, setParams] =
    useQueryStates(searchParams);

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
            onSelect={(id) => setParams({ session: id, tab: null })}
            selectedId={selectedId}
          />
        )}
        {view === "benchmarks" && (
          <BenchmarksPanel
            onOpenSession={(sessionId) =>
              setParams({ view: "sessions", session: sessionId, tab: null })
            }
          />
        )}
        {view === "admin" && <AdminPanel />}
      </main>
    </div>
  );
};
