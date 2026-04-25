import { useEffect, useState } from "react";
import { api } from "../lib/api";
import {
  type Connection,
  connectionStore,
  useConnection,
} from "../lib/connection";

type HealthState = "unknown" | "ok" | "error";

export const ConnectionPanel = (): React.JSX.Element => {
  const connection = useConnection();
  const [health, setHealth] = useState<HealthState>("unknown");
  const [draftBaseUrl, setDraftBaseUrl] = useState(connection.baseUrl);
  const [draftToken, setDraftToken] = useState(connection.token);

  useEffect(() => {
    setDraftBaseUrl(connection.baseUrl);
    setDraftToken(connection.token);
  }, [connection.baseUrl, connection.token]);

  useEffect(() => {
    let cancelled = false;
    setHealth("unknown");

    api
      .health()
      .then(() => {
        if (cancelled) {
          return;
        }
        setHealth("ok");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setHealth("error");
      });

    const interval = window.setInterval(() => {
      api
        .health()
        .then(() => {
          if (!cancelled) {
            setHealth("ok");
          }
        })
        .catch(() => {
          if (!cancelled) {
            setHealth("error");
          }
        });
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const commit = (next: Partial<Connection>): void => {
    if (next.baseUrl !== undefined) {
      connectionStore.setBaseUrl(next.baseUrl);
    }

    if (next.token !== undefined) {
      connectionStore.setToken(next.token);
    }
  };

  return (
    <div className="connection">
      <span
        className={`health-dot ${
          health === "ok" ? "good" : health === "error" ? "bad" : ""
        }`}
        title={`/health: ${health}`}
      />
      <input
        onBlur={() => commit({ baseUrl: draftBaseUrl })}
        onChange={(event) => setDraftBaseUrl(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit({ baseUrl: draftBaseUrl });
            (event.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder="API base URL"
        spellCheck={false}
        value={draftBaseUrl}
      />
      <input
        onBlur={() => commit({ token: draftToken })}
        onChange={(event) => setDraftToken(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit({ token: draftToken });
            (event.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder="JWT token"
        spellCheck={false}
        type="password"
        value={draftToken}
      />
    </div>
  );
};
