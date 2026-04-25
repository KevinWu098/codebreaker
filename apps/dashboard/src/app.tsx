import { useState } from "react";
import { Sidebar, type ViewId } from "@/components/sidebar";
import { AdminPanel } from "@/features/admin/admin-panel";
import { SessionDetail } from "@/features/sessions/session-detail";
import { SessionsList } from "@/features/sessions/sessions-list";
import { useThemeSync } from "@/hooks/use-theme";

interface SessionsViewProps {
  onClearSelection: () => void;
  onSelect: (id: string) => void;
  selectedId: string | undefined;
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
  const [view, setView] = useState<ViewId>("sessions");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  return (
    <div className="app-shell">
      <Sidebar
        onSelectView={(next) => {
          setView(next);

          if (next !== "sessions") {
            setSelectedId(undefined);
          }
        }}
        view={view}
      />

      <main className="page">
        {view === "sessions" && (
          <SessionsView
            onClearSelection={() => setSelectedId(undefined)}
            onSelect={(id) => setSelectedId(id)}
            selectedId={selectedId}
          />
        )}
        {view === "admin" && <AdminPanel />}
      </main>
    </div>
  );
};
