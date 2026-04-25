import type { SandboxProfileName } from "@codebreaker/shared/schemas/sandbox";
import { useState } from "react";
import { Card } from "../../components/card";
import { ErrorBanner } from "../../components/error-banner";
import { JsonView } from "../../components/json-view";
import { RefreshButton } from "../../components/refresh-button";
import { useAsync } from "../../hooks/use-async";
import { api } from "../../lib/api";
import { useConnection } from "../../lib/connection";
import { formatDuration, formatRelativeTime } from "../../lib/format";

interface Props {
  sessionId: string;
}

interface ExecRecord {
  command: string;
  error?: string;
  finishedAt?: number;
  result?: {
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
    timedOut: boolean;
    stdoutTruncated: boolean;
    stderrTruncated: boolean;
  };
  startedAt: number;
}

const PROFILES: SandboxProfileName[] = ["python", "node", "recon"];

export const SandboxPanel = ({ sessionId }: Props): React.JSX.Element => {
  const connection = useConnection();

  const sandbox = useAsync(
    () => api.getSandbox(sessionId),
    [sessionId, connection.baseUrl, connection.token],
    { enabled: connection.token.length > 0, pollMs: 5000 }
  );

  const [command, setCommand] = useState("uname -a");
  const [cwd, setCwd] = useState("");
  const [profile, setProfile] = useState<SandboxProfileName | "">("");
  const [timeout, setTimeoutSeconds] = useState<string>("60");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<ExecRecord[]>([]);

  const execute = async (): Promise<void> => {
    if (!command.trim()) {
      return;
    }

    setRunning(true);
    const record: ExecRecord = {
      command,
      startedAt: Date.now(),
    };

    setHistory((previous) => [record, ...previous].slice(0, 20));

    try {
      const response = await api.execSandbox(sessionId, {
        command,
        ...(cwd ? { cwd } : {}),
        ...(profile ? { profile: profile as SandboxProfileName } : {}),
        ...(timeout ? { timeoutSeconds: Number(timeout) } : {}),
      });

      setHistory((previous) =>
        previous.map((entry) =>
          entry === record
            ? {
                ...entry,
                finishedAt: Date.now(),
                result: {
                  durationMs: response.result.durationMs,
                  exitCode: response.result.exitCode,
                  stderr: response.result.stderr,
                  stderrTruncated: response.result.stderrTruncated,
                  stdout: response.result.stdout,
                  stdoutTruncated: response.result.stdoutTruncated,
                  timedOut: response.result.timedOut,
                },
              }
            : entry
        )
      );

      sandbox.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";

      setHistory((previous) =>
        previous.map((entry) =>
          entry === record
            ? {
                ...entry,
                error: message,
                finishedAt: Date.now(),
              }
            : entry
        )
      );
    } finally {
      setRunning(false);
    }
  };

  const metadata = sandbox.data?.sandbox;

  return (
    <>
      <Card
        actions={<RefreshButton onClick={() => sandbox.refresh()} />}
        title="Sandbox metadata (Modal)"
      >
        <ErrorBanner error={sandbox.error} title="Sandbox unavailable" />
        {!sandbox.data && <span className="dim">Loading…</span>}
        {sandbox.data && metadata === null && (
          <div className="empty">No sandbox attached to this session</div>
        )}
        {metadata && (
          <dl className="kv">
            <dt>sandbox_id</dt>
            <dd>{metadata.sandbox_id}</dd>
            <dt>session_id</dt>
            <dd>{metadata.session_id}</dd>
            <dt>profile</dt>
            <dd>{metadata.profile}</dd>
            <dt>image fingerprint</dt>
            <dd>{metadata.image_fingerprint}</dd>
            <dt>snapshot</dt>
            <dd>{metadata.snapshot_id ?? "—"}</dd>
            <dt>created</dt>
            <dd>
              {new Date(metadata.created_at * 1000).toISOString()}
              <span className="dim">
                {" · "}
                {formatRelativeTime(metadata.created_at * 1000)}
              </span>
            </dd>
          </dl>
        )}
      </Card>

      <Card title="Execute command (operator only)">
        <div className="form-row">
          <label htmlFor="exec-cmd">Command</label>
          <textarea
            id="exec-cmd"
            onChange={(event) => setCommand(event.target.value)}
            placeholder="e.g. uname -a"
            rows={2}
            value={command}
          />
        </div>
        <div className="row-grid">
          <div className="form-row">
            <label htmlFor="exec-cwd">Working directory</label>
            <input
              id="exec-cwd"
              onChange={(event) => setCwd(event.target.value)}
              placeholder="default"
              value={cwd}
            />
          </div>
          <div className="form-row">
            <label htmlFor="exec-profile">Profile override</label>
            <select
              id="exec-profile"
              onChange={(event) =>
                setProfile(event.target.value as SandboxProfileName | "")
              }
              value={profile}
            >
              <option value="">session default</option>
              {PROFILES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row-grid">
          <div className="form-row">
            <label htmlFor="exec-timeout">Timeout (s)</label>
            <input
              id="exec-timeout"
              min={1}
              onChange={(event) => setTimeoutSeconds(event.target.value)}
              type="number"
              value={timeout}
            />
          </div>
          <div className="form-row">
            <label>&nbsp;</label>
            <button
              className="btn btn-primary"
              disabled={running || !command.trim()}
              onClick={execute}
              type="button"
            >
              {running ? "Running…" : "Run"}
            </button>
          </div>
        </div>

        {history.length > 0 && (
          <div className="message-list" style={{ marginTop: 8 }}>
            {history.map((entry) => (
              <div className="card" key={`${entry.startedAt}:${entry.command}`}>
                <div className="exec-meta">
                  <span className="mono">$ {entry.command}</span>
                  {entry.result && (
                    <>
                      <span>exit {entry.result.exitCode}</span>
                      <span>{formatDuration(entry.result.durationMs)}</span>
                      {entry.result.timedOut && (
                        <span style={{ color: "var(--bad)" }}>timed out</span>
                      )}
                      {(entry.result.stdoutTruncated ||
                        entry.result.stderrTruncated) && (
                        <span style={{ color: "var(--warn)" }}>truncated</span>
                      )}
                    </>
                  )}
                  {entry.error && (
                    <span style={{ color: "var(--bad)" }}>error</span>
                  )}
                </div>
                {entry.error ? (
                  <div className="exec-console exec-stderr">{entry.error}</div>
                ) : entry.result ? (
                  <>
                    {entry.result.stdout && (
                      <div className="exec-console exec-stdout">
                        {entry.result.stdout}
                      </div>
                    )}
                    {entry.result.stderr && (
                      <div
                        className="exec-console exec-stderr"
                        style={{ marginTop: 6 }}
                      >
                        {entry.result.stderr}
                      </div>
                    )}
                    {!(entry.result.stdout || entry.result.stderr) && (
                      <div className="dim text-xs">(no output)</div>
                    )}
                  </>
                ) : (
                  <div className="dim text-xs">running…</div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {metadata && (
        <Card title="Raw sandbox JSON">
          <JsonView value={metadata} />
        </Card>
      )}
    </>
  );
};
