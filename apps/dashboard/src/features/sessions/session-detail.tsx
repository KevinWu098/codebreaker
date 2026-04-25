import { estimateTokenUsageCost } from "@codebreaker/shared/lib/models";
import { truncateId } from "@codebreaker/shared/lib/utils";
import type { SessionRow } from "@codebreaker/shared/schemas/api";
import {
  Content as TabsContent,
  List as TabsList,
  Root as TabsRoot,
  Trigger as TabsTrigger,
} from "@radix-ui/react-tabs";
import { ChevronLeft, Trash2 } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useState } from "react";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { DefinitionField } from "@/components/definition-field";
import { ErrorState } from "@/components/error-state";
import { JsonView } from "@/components/json-view";
import { RefreshButton } from "@/components/refresh-button";
import { Spinner } from "@/components/spinner";
import { ChatPanel } from "@/features/chat/chat-panel";
import { SandboxPanel } from "@/features/sandbox/sandbox-panel";
import { MessagesPanel } from "@/features/sessions/messages-panel";
import { useArchiveSessionMutation } from "@/hooks/mutations";
import {
  useSessionConfigQuery,
  useSessionQuery,
  useSessionStateQuery,
} from "@/hooks/queries";
import {
  formatNumber,
  formatRelativeTime,
  formatRepo,
  formatUsd,
} from "@/lib/format";

const TAB_IDS = ["overview", "config", "messages", "chat", "sandbox"] as const;

type Tab = (typeof TAB_IDS)[number];

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

const BENCHMARK_SESSION_PREFIX = "bench-";

const getBenchmarkRunId = (sessionId: string): string | null => {
  if (!sessionId.startsWith(BENCHMARK_SESSION_PREFIX)) {
    return null;
  }

  const runId = sessionId.slice(BENCHMARK_SESSION_PREFIX.length);
  return runId || null;
};

const formatSessionRepo = (
  session: Pick<
    SessionRow,
    "repoName" | "repoOwner" | "runRepoName" | "targetRepoName"
  >
): string => {
  if (session.repoName || session.repoOwner) {
    return formatRepo(session.repoOwner, session.repoName);
  }

  return session.runRepoName ?? session.targetRepoName ?? "—";
};

interface SessionDetailProps {
  onArchived: () => void;
  onBack: () => void;
  onOpenBenchmarkRun?: (runId: string) => void;
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
  const archive = useArchiveSessionMutation(sessionId);

  const runArchive = (): void => {
    archive.mutate(undefined, {
      onSuccess: () => {
        setConfirming(false);
        onArchived();
      },
    });
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
              archiving={archive.isPending}
              onCancel={() => setConfirming(false)}
              onConfirm={runArchive}
            />
          ) : (
            <Button
              disabled={archive.isPending || row?.status === "archived"}
              onClick={() => setConfirming(true)}
              variant="danger"
            >
              <Trash2 aria-hidden="true" size={12} />
              <span>archive</span>
            </Button>
          )}
        </div>
      </div>
      <ErrorState error={archive.error} title="archive failed" />
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

const SessionRowCard = ({
  onOpenBenchmarkRun,
  row,
}: {
  onOpenBenchmarkRun?: (runId: string) => void;
  row: SessionRow;
}): React.JSX.Element => {
  const tokens = row.inputTokens + row.outputTokens;
  const tokenCost = estimateTokenUsageCost({
    inputTokens: row.inputTokens,
    modelId: row.modelId,
    modelProvider: row.modelProvider,
    outputTokens: row.outputTokens,
  });
  const benchmarkRunId = getBenchmarkRunId(row.id);
  const idValue =
    benchmarkRunId && onOpenBenchmarkRun ? (
      <button
        className="id-link break-all text-left"
        onClick={() => onOpenBenchmarkRun(benchmarkRunId)}
        title="open benchmark run"
        type="button"
      >
        {row.id}
      </button>
    ) : (
      row.id
    );

  return (
    <Card title="d1 session row">
      <dl className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-2 text-xs">
        <DefinitionField label="id" mono>
          {idValue}
        </DefinitionField>
        <DefinitionField label="status">
          <Badge status={row.status} />
        </DefinitionField>
        <DefinitionField label="title">{row.title ?? "—"}</DefinitionField>
        <DefinitionField label="model" mono>
          {row.modelProvider}/{row.modelId}
        </DefinitionField>
        <DefinitionField label="repo" mono>
          {formatSessionRepo(row)}
        </DefinitionField>
        <DefinitionField label="turns" numeric>
          {formatNumber(row.turnCount)}
        </DefinitionField>
        <DefinitionField label="tokens (in/out/total)" numeric>
          {formatNumber(row.inputTokens)} / {formatNumber(row.outputTokens)} /{" "}
          {formatNumber(tokens)}
          {tokenCost ? (
            <span
              className="ml-2 text-fg-muted"
              title={`${formatUsd(tokenCost.pricing.inputUsdPerMillionTokens)} input / ${formatUsd(tokenCost.pricing.outputUsdPerMillionTokens)} output per 1M tokens`}
            >
              ({formatUsd(tokenCost.inputUsd)} /{" "}
              {formatUsd(tokenCost.outputUsd)} /{" "}
              <strong className="font-semibold text-fg">
                {formatUsd(tokenCost.totalUsd)}
              </strong>
              )
            </span>
          ) : null}
        </DefinitionField>
        <DefinitionField label="created" mono>
          {row.createdAt}
        </DefinitionField>
        <DefinitionField label="updated" mono>
          {row.updatedAt}
        </DefinitionField>
        <DefinitionField label="completed" mono>
          {row.completedAt ?? "—"}
        </DefinitionField>
      </dl>
    </Card>
  );
};

export const SessionDetail = ({
  onArchived,
  onBack,
  onOpenBenchmarkRun,
  sessionId,
}: SessionDetailProps): React.JSX.Element => {
  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringLiteral(TAB_IDS).withDefault("overview")
  );
  const session = useSessionQuery(sessionId);
  const state = useSessionStateQuery(sessionId);
  const config = useSessionConfigQuery(sessionId, tab === "config");
  const row = session.data?.session;

  return (
    <div className="space-y-4">
      <SessionHeader
        loading={session.isFetching || state.isFetching}
        onArchived={onArchived}
        onBack={onBack}
        onRefresh={() => {
          session.refetch();
          state.refetch();
        }}
        row={row}
        sessionId={sessionId}
      />

      <TabsRoot onValueChange={(value) => setTab(value as Tab)} value={tab}>
        <TabsList aria-label="session sections" className="tabs">
          {TABS.map((entry) => (
            <TabsTrigger className="tab" key={entry.id} value={entry.id}>
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent className="mt-4 outline-none" value="overview">
          <div className="space-y-4">
            <ErrorState error={session.error} title="load failed" />
            {row && (
              <SessionRowCard
                {...(onOpenBenchmarkRun ? { onOpenBenchmarkRun } : {})}
                row={row}
              />
            )}
            <Card
              actions={
                <RefreshButton
                  loading={state.isFetching}
                  onClick={() => state.refetch()}
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
        </TabsContent>

        <TabsContent className="mt-4 outline-none" value="config">
          <Card
            actions={
              <RefreshButton
                loading={config.isFetching}
                onClick={() => config.refetch()}
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
        </TabsContent>

        <TabsContent className="mt-4 outline-none" value="messages">
          <MessagesPanel sessionId={sessionId} />
        </TabsContent>

        <TabsContent className="mt-4 outline-none" value="chat">
          <ChatPanel sessionId={sessionId} />
        </TabsContent>

        <TabsContent className="mt-4 outline-none" value="sandbox">
          <SandboxPanel sessionId={sessionId} />
        </TabsContent>
      </TabsRoot>
    </div>
  );
};
