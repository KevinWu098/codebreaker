import { useState } from "react";
import { ConnectionPanel } from "./components/connection-panel";
import { AdminPanel } from "./features/admin/admin-panel";
import { SessionDetail } from "./features/sessions/session-detail";
import { SessionsList } from "./features/sessions/sessions-list";

type View = "sessions" | "admin";

export const App = (): React.JSX.Element => {
  const [view, setView] = useState<View>("sessions");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  return (
    <div className="app">
      <header className="topbar">
        <h1>
          <span className="accent">codebreaker</span> control plane
        </h1>
        <nav className="nav">
          <button
            className={view === "sessions" ? "active" : ""}
            onClick={() => setView("sessions")}
            type="button"
          >
            Sessions
          </button>
          <button
            className={view === "admin" ? "active" : ""}
            onClick={() => setView("admin")}
            type="button"
          >
            Admin
          </button>
        </nav>
        <span className="spacer" />
        <ConnectionPanel />
      </header>

      {view === "sessions" ? (
        <main className="layout">
          <SessionsList
            onSelect={(id) => setSelectedId(id)}
            selectedId={selectedId}
          />
          {selectedId ? (
            <SessionDetail
              key={selectedId}
              onArchived={() => {
                /* keep selection so user can confirm archive */
              }}
              sessionId={selectedId}
            />
          ) : (
            <div className="main">
              <div className="main-empty">
                <div>Select a session, or create a new one to begin.</div>
                <div className="dim text-xs">
                  This dashboard is a thin client over the Hono control-plane
                  API. Every action maps directly to a documented endpoint.
                </div>
              </div>
            </div>
          )}
        </main>
      ) : (
        <main className="layout full">
          <AdminPanel />
        </main>
      )}
    </div>
  );
};
