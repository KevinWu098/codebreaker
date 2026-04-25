import { truncateId } from "@codebreaker/shared/lib/utils";
import {
  type ExecResult,
  type SandboxProfileName,
  SandboxProfileNameSchema,
} from "@codebreaker/shared/schemas/sandbox";
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
import { useExecSandboxMutation } from "@/hooks/mutations";
import { useSandboxQuery } from "@/hooks/queries";
import { formatDuration, formatRelativeTime } from "@/lib/format";

interface SandboxPanelProps {
  sessionId: string;
}

interface ExecRecord {
  command: string;
  error?: string;
  finishedAt?: number;
  result?: ExecResult;
  startedAt: number;
}

const PROFILES = SandboxProfileNameSchema.options;

const recordKey = (record: ExecRecord): string =>
  `${record.startedAt}-${record.command.length}`;

export const SandboxPanel = ({
  sessionId,
}: SandboxPanelProps): React.JSX.Element => {
  const cmdId = useId();
  const cwdId = useId();
  const profileFieldId = useId();
  const timeoutId = useId();

  const sandbox = useSandboxQuery(sessionId);
  const exec = useExecSandboxMutation(sessionId);

  const [command, setCommand] = useState("uname -a");
  const [cwd, setCwd] = useState("");
  const [profile, setProfile] = useState<SandboxProfileName | "">("");
  const [timeoutValue, setTimeoutValue] = useState("60");
  const [history, setHistory] = useState<readonly ExecRecord[]>([]);

  const execute = (): void => {
    const trimmed = command.trim();

    if (!trimmed) {
      return;
    }

    const startedAt = Date.now();

    setHistory((previous) =>
      [{ command: trimmed, startedAt }, ...previous].slice(0, 20)
    );

    exec.mutate(
      {
        command: trimmed,
        ...(cwd ? { cwd } : {}),
        ...(profile ? { profile } : {}),
        ...(timeoutValue ? { timeoutSeconds: Number(timeoutValue) } : {}),
      },
      {
        onError: (error) => {
          const message =
            error instanceof Error ? error.message : "unknown error";
          setHistory((previous) =>
            previous.map((entry) =>
              entry.startedAt === startedAt
                ? { ...entry, error: message, finishedAt: Date.now() }
                : entry
            )
          );
        },
        onSuccess: (response) => {
          setHistory((previous) =>
            previous.map((entry) =>
              entry.startedAt === startedAt
                ? {
                    ...entry,
                    finishedAt: Date.now(),
                    result: { ...response.result },
                  }
                : entry
            )
          );
        },
      }
    );
  };

  const metadata = sandbox.data?.sandbox;

  return (
    <div className="space-y-4">
      <Card
        actions={
          <RefreshButton
            loading={sandbox.isFetching}
            onClick={() => sandbox.refetch()}
          />
        }
        title="sandbox metadata · modal"
      >
        <ErrorState
          error={sandbox.error ?? undefined}
          title="sandbox unavailable"
        />
        {sandbox.isLoading && (
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
              disabled={exec.isPending || !command.trim()}
              onClick={execute}
              variant="primary"
            >
              <Play aria-hidden="true" size={12} />
              <span>{exec.isPending ? "running…" : "run"}</span>
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
