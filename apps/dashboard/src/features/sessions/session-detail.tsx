import type { SessionRow } from "@codebreaker/shared/schemas/api";
import { ChevronLeft, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { ErrorState } from "@/components/error-state";
import { JsonView } from "@/components/json-view";
import { RefreshButton } from "@/components/refresh-button";
import { Spinner } from "@/components/spinner";
import { ChatPanel } from "@/features/chat/chat-panel";
import { SandboxPanel } from "@/features/sandbox/sandbox-panel";
import { MessagesPanel } from "@/features/sessions/messages-panel";
import { type AsyncState, useAsync } from "@/hooks/use-async";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useConnection } from "@/lib/connection";
import { formatNumber, formatRelativeTime, truncateId } from "@/lib/format";

type Tab = "overview" | "config" | "messages" | "chat" | "sandbox";

interface TabDef {
  id: Tab;
  label: string;
}

const TABS: readonly TabDef[] = [
  { id: "overview", label: "overview" },
  { id: "config", label: "config" },
  { id: "messages", label: "messages" },
  { id: "chat", label: "chat" },
  { id: "sandbox", label: "sandbox" },
];

interface SessionDetailProps {
  onArchived: () => void;
  onBack: () => void;
  sessionId: string;
}

interface HeaderProps {
  loading: boolean;
  onArchived: () => void;
  onBack: () => void;
  onRefresh: () => void;
  row: SessionRow | undefined;
  sessionId: string;
}

const SessionHeader = ({
  loading,
  onArchived,
  onBack,
  onRefresh,
  row,
  sessionId,
}: HeaderProps): React.JSX.Element => {
  const [confirming, setConfirming] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  const archive = async (): Promise<void> => {
    setArchiving(true);
    setError(undefined);

    try {
      await api.archiveSession(sessionId);
      setConfirming(false);
      onArchived();
    } catch (err) {
      setError(err instanceof Error ? err : new Error("unknown error"));
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="page-header">
        <div className="space-y-1">
          <button
            className="flex items-center gap-1 text-fg-muted text-xs hover:text-fg"
            onClick={onBack}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={12} />
            <span>back to sessions</span>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="lowercase">{row?.title ?? truncateId(sessionId)}</h1>
            {row ? <Badge status={row.status} /> : null}
          </div>
          <div className="font-mono text-fg-muted text-xs">
            {sessionId}
            {row && (
              <>
                <span className="mx-2 text-fg-subtle">·</span>
                <span>updated {formatRelativeTime(row.updatedAt)}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <RefreshButton loading={loading} onClick={onRefresh} />
          {confirming ? (
            <ConfirmArchive
              archiving={archiving}
              onCancel={() => setConfirming(false)}
              onConfirm={archive}
            />
          ) : (
            <Button
              disabled={archiving || row?.status === "archived"}
              onClick={() => setConfirming(true)}
              variant="danger"
            >
              <Trash2 aria-hidden="true" size={12} />
              <span>archive</span>
            </Button>
          )}
        </div>
      </div>
      <ErrorState error={error} title="archive failed" />
    </div>
  );
};

interface ConfirmArchiveProps {
  archiving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const ConfirmArchive = ({
  archiving,
  onCancel,
  onConfirm,
}: ConfirmArchiveProps): React.JSX.Element => (
  <>
    <span className="text-fg-muted text-xs">archive?</span>
    <Button disabled={archiving} onClick={onCancel} variant="ghost">
      cancel
    </Button>
    <Button disabled={archiving} onClick={onConfirm} variant="danger">
      {archiving ? "archiving…" : "confirm"}
    </Button>
  </>
);

interface TabBarProps {
  active: Tab;
  onChange: (next: Tab) => void;
}

const TabBar = ({ active, onChange }: TabBarProps): React.JSX.Element => (
  <div aria-label="session sections" className="tabs" role="tablist">
    {TABS.map((entry) => (
      <button
        aria-selected={active === entry.id}
        className="tab"
        key={entry.id}
        onClick={() => onChange(entry.id)}
        role="tab"
        type="button"
      >
        {entry.label}
      </button>
    ))}
  </div>
);

const formatRepo = (row: SessionRow): string => {
  if (row.repoOwner) {
    return `${row.repoOwner}/${row.repoName ?? ""}`;
  }

  return row.repoName ?? "—";
};

const SessionRowCard = ({ row }: { row: SessionRow }): React.JSX.Element => {
  const tokens = row.inputTokens + row.outputTokens;

  return (
    <Card title="d1 session row">
      <dl className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-2 text-xs">
        <Field label="id" mono>
          {row.id}
        </Field>
        <Field label="status">
          <Badge status={row.status} />
        </Field>
        <Field label="title">{row.title ?? "—"}</Field>
        <Field label="model" mono>
          {row.modelProvider}/{row.modelId}
        </Field>
        <Field label="repo" mono>
          {formatRepo(row)}
        </Field>
        <Field label="turns" numeric>
          {formatNumber(row.turnCount)}
        </Field>
        <Field label="tokens (in/out/total)" numeric>
          {formatNumber(row.inputTokens)} / {formatNumber(row.outputTokens)} /{" "}
          {formatNumber(tokens)}
        </Field>
        <Field label="created" mono>
          {row.createdAt}
        </Field>
        <Field label="updated" mono>
          {row.updatedAt}
        </Field>
        <Field label="completed" mono>
          {row.completedAt ?? "—"}
        </Field>
      </dl>
    </Card>
  );
};

interface OverviewProps {
  row: SessionRow | undefined;
  sessionError: Error | undefined;
  state: AsyncState<{ state: unknown }>;
}

const OverviewTab = ({
  row,
  sessionError,
  state,
}: OverviewProps): React.JSX.Element => (
  <div className="space-y-4">
    <ErrorState error={sessionError} title="load failed" />
    {row && <SessionRowCard row={row} />}
    <Card
      actions={
        <RefreshButton
          loading={state.loading}
          onClick={() => state.refresh()}
        />
      }
      title="durable object state"
    >
      <ErrorState error={state.error} title="state unavailable" />
      {state.data ? (
        <JsonView maxHeight={420} value={state.data.state} />
      ) : (
        <Spinner />
      )}
    </Card>
  </div>
);

interface ConfigTabProps {
  config: AsyncState<{ config: unknown }>;
}

const ConfigTab = ({ config }: ConfigTabProps): React.JSX.Element => (
  <Card
    actions={
      <RefreshButton
        loading={config.loading}
        onClick={() => config.refresh()}
      />
    }
    title="session config (from agent)"
  >
    <ErrorState error={config.error} title="config unavailable" />
    {config.data ? (
      <JsonView maxHeight={520} value={config.data.config} />
    ) : (
      <Spinner />
    )}
  </Card>
);

export const SessionDetail = ({
  onArchived,
  onBack,
  sessionId,
}: SessionDetailProps): React.JSX.Element => {
  const connection = useConnection();
  const enabled = connection.token.length > 0;
  const [tab, setTab] = useState<Tab>("overview");

  const baseKey = `${sessionId}:${connection.baseUrl}:${connection.token}`;

  const session = useAsync(() => api.getSession(sessionId), {
    enabled,
    key: `session:${baseKey}`,
    pollMs: 4000,
  });

  const state = useAsync(() => api.getState(sessionId), {
    enabled,
    key: `state:${baseKey}`,
    pollMs: 4000,
  });

  const config = useAsync(() => api.getConfig(sessionId), {
    enabled: enabled && tab === "config",
    key: `config:${baseKey}:${tab}`,
  });

  const row = session.data?.session;

  return (
    <div className="space-y-4">
      <SessionHeader
        loading={session.loading || state.loading}
        onArchived={onArchived}
        onBack={onBack}
        onRefresh={() => {
          session.refresh();
          state.refresh();
        }}
        row={row}
        sessionId={sessionId}
      />

      <TabBar active={tab} onChange={setTab} />

      {tab === "overview" && (
        <OverviewTab row={row} sessionError={session.error} state={state} />
      )}
      {tab === "config" && <ConfigTab config={config} />}
      {tab === "messages" && <MessagesPanel sessionId={sessionId} />}
      {tab === "chat" && <ChatPanel sessionId={sessionId} />}
      {tab === "sandbox" && <SandboxPanel sessionId={sessionId} />}
    </div>
  );
};

interface FieldProps {
  children: React.ReactNode;
  label: string;
  mono?: boolean;
  numeric?: boolean;
}

const Field = ({
  children,
  label,
  mono,
  numeric,
}: FieldProps): React.JSX.Element => (
  <>
    <dt className="text-[10px] text-fg-muted uppercase tracking-wider">
      {label}
    </dt>
    <dd
      className={cn("text-fg", mono && "font-mono", numeric && "tabular-nums")}
    >
      {children}
    </dd>
  </>
);
