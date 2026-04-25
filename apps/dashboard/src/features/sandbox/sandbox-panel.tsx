import type { SandboxProfileName } from "@codebreaker/shared/schemas/sandbox";
import { Play } from "lucide-react";
import { useId, useState } from "react";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { JsonView } from "@/components/json-view";
import { RefreshButton } from "@/components/refresh-button";
import { Spinner } from "@/components/spinner";
import { useAsync } from "@/hooks/use-async";
import { api } from "@/lib/api";
import { useConnection } from "@/lib/connection";
import { formatDuration, formatRelativeTime, truncateId } from "@/lib/format";

interface SandboxPanelProps {
  sessionId: string;
}

interface ExecResult {
  durationMs: number;
  exitCode: number;
  stderr: string;
  stderrTruncated: boolean;
  stdout: string;
  stdoutTruncated: boolean;
  timedOut: boolean;
}

interface ExecRecord {
  command: string;
  error?: string;
  finishedAt?: number;
  result?: ExecResult;
  startedAt: number;
}

const PROFILES: readonly SandboxProfileName[] = ["python", "node", "recon"];

const recordKey = (record: ExecRecord): string =>
  `${record.startedAt}-${record.command.length}`;

export const SandboxPanel = ({
  sessionId,
}: SandboxPanelProps): React.JSX.Element => {
  const connection = useConnection();
  const enabled = connection.token.length > 0;
  const cmdId = useId();
  const cwdId = useId();
  const profileFieldId = useId();
  const timeoutId = useId();

  const sandbox = useAsync(() => api.getSandbox(sessionId), {
    enabled,
    key: `sandbox:${sessionId}:${connection.baseUrl}:${connection.token}`,
    pollMs: 5000,
  });

  const [command, setCommand] = useState("uname -a");
  const [cwd, setCwd] = useState("");
  const [profile, setProfile] = useState<SandboxProfileName | "">("");
  const [timeoutValue, setTimeoutValue] = useState("60");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<readonly ExecRecord[]>([]);

  const execute = async (): Promise<void> => {
    const trimmed = command.trim();

    if (!trimmed) {
      return;
    }

    setRunning(true);
    const record: ExecRecord = {
      command: trimmed,
      startedAt: Date.now(),
    };

    setHistory((previous) => [record, ...previous].slice(0, 20));

    try {
      const response = await api.execSandbox(sessionId, {
        command: trimmed,
        ...(cwd ? { cwd } : {}),
        ...(profile ? { profile } : {}),
        ...(timeoutValue ? { timeoutSeconds: Number(timeoutValue) } : {}),
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
      const message = err instanceof Error ? err.message : "unknown error";

      setHistory((previous) =>
        previous.map((entry) =>
          entry === record
            ? { ...entry, error: message, finishedAt: Date.now() }
            : entry
        )
      );
    } finally {
      setRunning(false);
    }
  };

  const metadata = sandbox.data?.sandbox;

  return (
    <div className="space-y-4">
      <Card
        actions={
          <RefreshButton
            loading={sandbox.loading}
            onClick={() => sandbox.refresh()}
          />
        }
        title="sandbox metadata · modal"
      >
        <ErrorState error={sandbox.error} title="sandbox unavailable" />
        {!(sandbox.data || sandbox.error) && (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        )}
        {sandbox.data && metadata === null && (
          <EmptyState
            hint="this session has no attached sandbox profile."
            title="no sandbox attached"
          />
        )}
        {metadata && (
          <dl className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-2 text-xs">
            <dt className="field-label">sandbox id</dt>
            <dd className="font-mono text-fg" title={metadata.sandbox_id}>
              {truncateId(metadata.sandbox_id, 16, 6)}
            </dd>

            <dt className="field-label">session id</dt>
            <dd className="font-mono text-fg">{metadata.session_id}</dd>

            <dt className="field-label">profile</dt>
            <dd>
              <Badge status="idle">{metadata.profile}</Badge>
            </dd>

            <dt className="field-label">image fingerprint</dt>
            <dd className="font-mono text-fg-muted">
              {metadata.image_fingerprint}
            </dd>

            <dt className="field-label">snapshot</dt>
            <dd className="font-mono text-fg-muted">
              {metadata.snapshot_id ?? "—"}
            </dd>

            <dt className="field-label">created</dt>
            <dd
              className="font-mono text-fg"
              title={new Date(metadata.created_at * 1000).toISOString()}
            >
              {formatRelativeTime(metadata.created_at * 1000)}
            </dd>
          </dl>
        )}
      </Card>

      <Card title="execute command · operator only">
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="field-label" htmlFor={cmdId}>
              command
            </label>
            <textarea
              className="input font-mono"
              id={cmdId}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="$ uname -a"
              rows={2}
              value={command}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="field-label" htmlFor={cwdId}>
                working directory
              </label>
              <input
                className="input font-mono"
                id={cwdId}
                onChange={(event) => setCwd(event.target.value)}
                placeholder="default"
                value={cwd}
              />
            </div>

            <div className="space-y-1">
              <label className="field-label" htmlFor={profileFieldId}>
                profile override
              </label>
              <select
                className="input"
                id={profileFieldId}
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

          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <div className="space-y-1">
              <label className="field-label" htmlFor={timeoutId}>
                timeout (s)
              </label>
              <input
                className="input tabular-nums"
                id={timeoutId}
                min={1}
                onChange={(event) => setTimeoutValue(event.target.value)}
                type="number"
                value={timeoutValue}
              />
            </div>
            <Button
              disabled={running || !command.trim()}
              onClick={execute}
              variant="primary"
            >
              <Play aria-hidden="true" size={12} />
              <span>{running ? "running…" : "run"}</span>
            </Button>
          </div>

          {history.length > 0 && (
            <div className="space-y-2">
              {history.map((entry) => (
                <ExecRecordRow entry={entry} key={recordKey(entry)} />
              ))}
            </div>
          )}
        </div>
      </Card>

      {metadata && (
        <Card title="raw sandbox json">
          <JsonView maxHeight={320} value={metadata} />
        </Card>
      )}
    </div>
  );
};

const ExecRecordRow = ({ entry }: { entry: ExecRecord }): React.JSX.Element => {
  const result = entry.result;

  return (
    <div className="card">
      <div className="card-header flex-wrap gap-2">
        <span className="font-mono text-fg text-xs">$ {entry.command}</span>
        <span className="flex items-center gap-2">
          {result && (
            <>
              <Badge
                status={
                  result.timedOut || result.exitCode !== 0
                    ? "failed"
                    : "completed"
                }
              >
                exit {result.exitCode}
              </Badge>
              <span className="font-mono text-fg-muted">
                {formatDuration(result.durationMs)}
              </span>
              {result.timedOut && <Badge status="failed">timed out</Badge>}
              {(result.stdoutTruncated || result.stderrTruncated) && (
                <Badge status="paused">truncated</Badge>
              )}
            </>
          )}
          {entry.error && <Badge status="failed">error</Badge>}
          {!(result || entry.error) && (
            <span className="text-fg-muted text-xs">running…</span>
          )}
        </span>
      </div>
      <div className="card-body space-y-2">
        {entry.error ? (
          <pre className="m-0 overflow-auto rounded border border-status-failed/40 bg-status-failed/5 p-2 font-mono text-status-failed text-xs">
            {entry.error}
          </pre>
        ) : null}
        {result?.stdout ? (
          <pre className="m-0 overflow-auto rounded border border-border bg-bg-overlay p-2 font-mono text-fg text-xs">
            {result.stdout}
          </pre>
        ) : null}
        {result?.stderr ? (
          <pre className="m-0 overflow-auto rounded border border-status-failed/40 bg-status-failed/5 p-2 font-mono text-status-failed text-xs">
            {result.stderr}
          </pre>
        ) : null}
        {result && !result.stdout && !result.stderr && !entry.error ? (
          <span className="text-fg-muted text-xs">(no output)</span>
        ) : null}
      </div>
    </div>
  );
};
