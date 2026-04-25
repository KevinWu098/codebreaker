import { useEffect, useState } from "react";
import { ApiClientError, api } from "@/lib/api";
import { connectionStore, useConnection } from "@/lib/connection";

type HealthState = "unknown" | "ok" | "error";

const HEALTH_LABEL: Record<HealthState, string> = {
  error: "offline",
  ok: "ok",
  unknown: "checking",
};

const HEALTH_DOT_CLASS: Record<HealthState, string> = {
  error: "bg-status-failed",
  ok: "bg-status-completed",
  unknown: "bg-status-idle",
};

export const ConnectionForm = (): React.JSX.Element => {
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

    const probe = (): void => {
      api
        .health()
        .then(() => {
          if (!cancelled) {
            setHealth("ok");
          }
        })
        .catch((err: unknown) => {
          if (cancelled) {
            return;
          }

          if (err instanceof ApiClientError && err.status === 401) {
            setHealth("ok");
            return;
          }

          setHealth("error");
        });
    };

    probe();
    const interval = window.setInterval(probe, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const commitBaseUrl = (): void => {
    connectionStore.setBaseUrl(draftBaseUrl);
  };

  const commitToken = (): void => {
    connectionStore.setToken(draftToken);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-fg-muted uppercase tracking-wider">
          connection
        </span>
        <span
          aria-hidden="true"
          className={`status-dot ${HEALTH_DOT_CLASS[health]}`}
          title={`status: ${HEALTH_LABEL[health]}`}
        />
        <span className="text-[10px] text-fg-muted uppercase tracking-wider">
          {HEALTH_LABEL[health]}
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="field-label">base url</span>
        <input
          className="input font-mono text-xs"
          onBlur={commitBaseUrl}
          onChange={(event) => setDraftBaseUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitBaseUrl();
              event.currentTarget.blur();
            }
          }}
          placeholder="https://worker.example.dev"
          spellCheck={false}
          value={draftBaseUrl}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="field-label">jwt token</span>
        <input
          className="input font-mono text-xs"
          onBlur={commitToken}
          onChange={(event) => setDraftToken(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitToken();
              event.currentTarget.blur();
            }
          }}
          placeholder="HS256 bearer"
          spellCheck={false}
          type="password"
          value={draftToken}
        />
      </label>
    </div>
  );
};
