import {
  MODEL_OPTIONS,
  MODEL_OPTIONS_BY_PROVIDER,
  MODEL_PROVIDERS,
} from "@codebreaker/shared/lib/models";
import type {
  AuditBudgets,
  AuditFindingRow,
  AuditFindingStatus,
  AuditRow,
  AuditShardRow,
  AuditVulnClass,
  CreateAuditRequest,
  ShardKind,
} from "@codebreaker/shared/schemas/audits";
import {
  AUDIT_SHARD_KINDS,
  AUDIT_VULN_CLASSES,
} from "@codebreaker/shared/schemas/audits";
import {
  Content as TabsContent,
  List as TabsList,
  Root as TabsRoot,
  Trigger as TabsTrigger,
} from "@radix-ui/react-tabs";
import {
  Eye,
  Play,
  RefreshCw,
  ShieldAlert,
  Square,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { DefinitionField } from "@/components/definition-field";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { JsonView } from "@/components/json-view";
import { PageHeader } from "@/components/page-header";
import { Spinner } from "@/components/spinner";
import {
  useCancelAuditMutation,
  useCleanupAuditMutation,
  useCreateAuditMutation,
  useDismissFindingMutation,
} from "@/hooks/mutations";
import { useAuditQuery, useAuditsQuery } from "@/hooks/queries";
import { isAuthorized, useConnection } from "@/lib/connection";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const DEFAULT_MODEL = MODEL_OPTIONS_BY_PROVIDER.kimi[0];
const DEFAULT_MIN_CONFIDENCE = 0.7;
const PERCENT_FACTOR = 100;
const PROGRESS_FACTOR = PERCENT_FACTOR;
const ID_DISPLAY_LENGTH = 8;
// Investigator/validator subagent defaults. Cascaded to children unless a
// per-shard override (or `coordinatorBudgets` for the coordinator) wins.
const DEFAULT_MAX_INPUT_TOKENS = 250_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 50_000;
// Coordinator-specific defaults. Smaller than the subagent default because
// the coordinator's job is to orient + delegate, not to read code itself.
// Dispatch + finalize tools bypass this cap on the backend.
const COORDINATOR_DEFAULT_MAX_INPUT_TOKENS = 150_000;
const COORDINATOR_DEFAULT_MAX_OUTPUT_TOKENS = 30_000;
const TOKENS_PER_K = 1000;

interface ShardBudgetOverride {
  maxInputK: string;
  maxOutputK: string;
}

const emptyShardOverride = (): ShardBudgetOverride => ({
  maxInputK: "",
  maxOutputK: "",
});

const parsePositiveTokens = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (trimmed === "") {
    return;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return;
  }
  return Math.round(parsed * TOKENS_PER_K);
};

const overrideToBudgets = (
  override: ShardBudgetOverride
): AuditBudgets | null => {
  const maxInputTokens = parsePositiveTokens(override.maxInputK);
  const maxOutputTokens = parsePositiveTokens(override.maxOutputK);
  if (maxInputTokens === undefined && maxOutputTokens === undefined) {
    return null;
  }
  return {
    ...(maxInputTokens === undefined ? {} : { maxInputTokens }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
  };
};

const collectShardBudgets = (
  overrides: Record<ShardKind, ShardBudgetOverride>
): Partial<Record<ShardKind, AuditBudgets>> => {
  const result: Partial<Record<ShardKind, AuditBudgets>> = {};
  for (const kind of AUDIT_SHARD_KINDS) {
    const resolved = overrideToBudgets(overrides[kind]);
    if (resolved) {
      result[kind] = resolved;
    }
  }
  return result;
};

const modelValue = (model: { provider: string; id: string }): string =>
  `${model.provider}/${model.id}`;

const findingStatusClass: Record<AuditFindingStatus, string> = {
  candidate: "text-fg-muted",
  dismissed: "text-status-paused line-through",
  validated: "text-status-completed",
};

const FINDING_STATUS_OPTIONS: ReadonlyArray<AuditFindingStatus | "all"> = [
  "all",
  "validated",
  "candidate",
  "dismissed",
];

interface AuditsPanelProps {
  onOpenSession?: ((sessionId: string) => void) | undefined;
  onSelectAudit: (id: string | null) => void;
  onSelectFinding: (id: string | null) => void;
  selectedAuditId: string | null;
  selectedFindingId: string | null;
}

export const AuditsPanel = ({
  onOpenSession,
  onSelectAudit,
  onSelectFinding,
  selectedAuditId,
  selectedFindingId,
}: AuditsPanelProps): React.JSX.Element => {
  const connection = useConnection();
  const enabled = isAuthorized(connection);
  const audits = useAuditsQuery({ limit: 50, offset: 0 });
  const rows = audits.data?.audits ?? [];
  const create = useCreateAuditMutation();

  const [tab, setTab] = useState<"list" | "create">(
    selectedAuditId ? "list" : "list"
  );

  return (
    <div className="space-y-4">
      <PageHeader
        actions={
          <Button
            onClick={() => setTab(tab === "create" ? "list" : "create")}
            variant="primary"
          >
            <Play aria-hidden="true" size={12} />
            <span>{tab === "create" ? "view list" : "new audit"}</span>
          </Button>
        }
        description="point at any github repo. coordinator + investigators + validators surface novel-vuln candidates."
        title="audits"
      />

      {!enabled && (
        <EmptyState
          hint="set a jwt in the sidebar to load audits."
          title="no token configured"
        />
      )}

      <ErrorState error={audits.error} title="audits unavailable" />

      <TabsRoot
        onValueChange={(value) => setTab(value as "list" | "create")}
        value={tab}
      >
        <TabsList aria-label="audit sections" className="tabs">
          <TabsTrigger className="tab" value="list">
            list
          </TabsTrigger>
          <TabsTrigger className="tab" value="create">
            create
          </TabsTrigger>
        </TabsList>

        <TabsContent className="mt-4 space-y-4 outline-none" value="list">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(540px,3fr)]">
            <Card
              actions={
                <span className="btn pointer-events-none select-none border-transparent bg-transparent text-fg-muted">
                  <RefreshCw aria-hidden="true" size={12} />
                  <span>auto</span>
                </span>
              }
              bodyClassName="p-0"
              className="min-w-0 overflow-hidden"
              title="audits"
            >
              {audits.isPending && <Spinner />}
              {!audits.isPending && rows.length === 0 && (
                <EmptyState
                  hint="kick one off in the create tab."
                  title="no audits yet"
                />
              )}
              {rows.length > 0 && (
                <div className="overflow-x-auto">
                  <AuditsTable
                    onSelect={onSelectAudit}
                    rows={rows}
                    selectedId={selectedAuditId}
                  />
                </div>
              )}
            </Card>

            {selectedAuditId ? (
              <AuditDetail
                auditId={selectedAuditId}
                onOpenSession={onOpenSession}
                onSelectFinding={onSelectFinding}
                selectedFindingId={selectedFindingId}
              />
            ) : (
              <Card title="audit detail">
                <EmptyState
                  hint="select an audit on the left."
                  title="no audit selected"
                />
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent className="mt-4 space-y-4 outline-none" value="create">
          <CreateAuditCard
            disabled={!enabled || create.isPending}
            onCreated={(id) => {
              onSelectAudit(id);
              setTab("list");
            }}
            pending={create.isPending}
            submit={(req) => create.mutateAsync(req)}
          />
          <ErrorState error={create.error} title="create failed" />
        </TabsContent>
      </TabsRoot>
    </div>
  );
};

const AuditsTable = ({
  onSelect,
  rows,
  selectedId,
}: {
  onSelect: (id: string) => void;
  rows: AuditRow[];
  selectedId: string | null;
}): React.JSX.Element => (
  <table className="table">
    <thead>
      <tr>
        <th>audit</th>
        <th>repo</th>
        <th>status</th>
        <th className="num" title="validated / total candidate findings">
          findings
        </th>
        <th>updated</th>
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr
          aria-selected={row.id === selectedId}
          className={row.id === selectedId ? "bg-bg-hover" : undefined}
          key={row.id}
        >
          <td>
            <button
              className="id-link"
              onClick={() => onSelect(row.id)}
              type="button"
            >
              {row.id.slice(0, ID_DISPLAY_LENGTH)}
            </button>
          </td>
          <td
            className="max-w-64 truncate font-mono text-fg-muted text-xs"
            title={row.repoUrl}
          >
            {row.title ?? row.repoUrl}
          </td>
          <td>
            <Badge status={row.status} />
          </td>
          <td className="num text-xs">
            {formatNumber(row.validatedCount)} /{" "}
            {formatNumber(row.totalCandidates)}
          </td>
          <td className="text-fg-muted">{formatRelativeTime(row.updatedAt)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const CreateAuditCard = ({
  disabled,
  onCreated,
  pending,
  submit,
}: {
  disabled: boolean;
  onCreated: (id: string) => void;
  pending: boolean;
  submit: (req: CreateAuditRequest) => Promise<{ audit: AuditRow }>;
}): React.JSX.Element => {
  const [repoUrl, setRepoUrl] = useState("");
  const [ref, setRef] = useState("");
  const [title, setTitle] = useState("");
  const [model, setModel] = useState(modelValue(DEFAULT_MODEL));
  const [shards, setShards] = useState<ShardKind[]>([]);
  const [minConfidence, setMinConfidence] = useState(DEFAULT_MIN_CONFIDENCE);
  const [defaultMaxInputK, setDefaultMaxInputK] = useState(
    String(DEFAULT_MAX_INPUT_TOKENS / TOKENS_PER_K)
  );
  const [defaultMaxOutputK, setDefaultMaxOutputK] = useState(
    String(DEFAULT_MAX_OUTPUT_TOKENS / TOKENS_PER_K)
  );
  const [coordinatorMaxInputK, setCoordinatorMaxInputK] = useState(
    String(COORDINATOR_DEFAULT_MAX_INPUT_TOKENS / TOKENS_PER_K)
  );
  const [coordinatorMaxOutputK, setCoordinatorMaxOutputK] = useState(
    String(COORDINATOR_DEFAULT_MAX_OUTPUT_TOKENS / TOKENS_PER_K)
  );
  const [validationMaxInputK, setValidationMaxInputK] = useState("");
  const [validationMaxOutputK, setValidationMaxOutputK] = useState("");
  const [budgetsOpen, setBudgetsOpen] = useState(false);
  const [shardOverrides, setShardOverrides] = useState<
    Record<ShardKind, ShardBudgetOverride>
  >(
    () =>
      Object.fromEntries(
        AUDIT_SHARD_KINDS.map((kind) => [kind, emptyShardOverride()])
      ) as Record<ShardKind, ShardBudgetOverride>
  );

  const toggleShard = (shard: ShardKind, checked: boolean): void => {
    setShards((current) =>
      checked
        ? Array.from(new Set([...current, shard]))
        : current.filter((s) => s !== shard)
    );
  };

  const updateShardOverride = (
    shard: ShardKind,
    patch: Partial<ShardBudgetOverride>
  ): void => {
    setShardOverrides((current) => ({
      ...current,
      [shard]: { ...current[shard], ...patch },
    }));
  };

  const onSubmit = async (): Promise<void> => {
    const selected = MODEL_OPTIONS.find((opt) => modelValue(opt) === model);
    if (!(repoUrl && selected)) {
      return;
    }
    const defaultBudgets: AuditBudgets = {
      maxInputTokens:
        parsePositiveTokens(defaultMaxInputK) ?? DEFAULT_MAX_INPUT_TOKENS,
      maxOutputTokens:
        parsePositiveTokens(defaultMaxOutputK) ?? DEFAULT_MAX_OUTPUT_TOKENS,
    };
    const coordinatorBudgets: AuditBudgets = {
      maxInputTokens:
        parsePositiveTokens(coordinatorMaxInputK) ??
        COORDINATOR_DEFAULT_MAX_INPUT_TOKENS,
      maxOutputTokens:
        parsePositiveTokens(coordinatorMaxOutputK) ??
        COORDINATOR_DEFAULT_MAX_OUTPUT_TOKENS,
    };
    const validationBudgetsResolved = overrideToBudgets({
      maxInputK: validationMaxInputK,
      maxOutputK: validationMaxOutputK,
    });
    const shardBudgets = collectShardBudgets(shardOverrides);
    const request: CreateAuditRequest = {
      autoStart: true,
      budgets: defaultBudgets,
      coordinatorBudgets,
      investigatorTimeoutSeconds: 600,
      maxConcurrentInvestigators: 4,
      minConfidence,
      model: { id: selected.id, provider: selected.provider },
      repoUrl,
      sandboxProfile: "recon",
      timeoutSeconds: 2400,
      validatorTimeoutSeconds: 300,
      ...(ref ? { ref } : {}),
      ...(title ? { title } : {}),
      ...(shards.length > 0 ? { shards } : {}),
      ...(Object.keys(shardBudgets).length > 0 ? { shardBudgets } : {}),
      ...(validationBudgetsResolved
        ? { validationBudgets: validationBudgetsResolved }
        : {}),
    };
    const response = await submit(request);
    onCreated(response.audit.id);
  };

  return (
    <Card
      actions={
        <Button
          disabled={disabled || !repoUrl}
          onClick={onSubmit}
          variant="primary"
        >
          <ShieldAlert aria-hidden="true" size={12} />
          <span>{pending ? "starting…" : "start audit"}</span>
        </Button>
      }
      title="new audit"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="field-label">repository url</span>
          <input
            className="input"
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            type="url"
            value={repoUrl}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="field-label">ref (optional)</span>
          <input
            className="input"
            onChange={(e) => setRef(e.target.value)}
            placeholder="default branch HEAD"
            value={ref}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="field-label">title (optional)</span>
          <input
            className="input"
            onChange={(e) => setTitle(e.target.value)}
            placeholder="short label"
            value={title}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="field-label">model</span>
          <select
            className="input"
            onChange={(e) => setModel(e.target.value)}
            value={model}
          >
            {MODEL_PROVIDERS.map((provider) => (
              <optgroup key={provider} label={provider}>
                {MODEL_OPTIONS_BY_PROVIDER[provider].map((option) => (
                  <option key={option.id} value={modelValue(option)}>
                    {option.label} ({option.id})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs md:col-span-2">
          <span className="field-label">
            min confidence ({Math.round(minConfidence * PERCENT_FACTOR)}%)
          </span>
          <input
            className="w-full"
            max={1}
            min={0}
            onChange={(e) => setMinConfidence(Number(e.target.value))}
            step={0.05}
            type="range"
            value={minConfidence}
          />
        </label>
      </div>
      <fieldset className="mt-4 space-y-2 text-xs">
        <legend className="field-label">
          shards (leave blank to let coordinator decide)
        </legend>
        <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-5">
          {AUDIT_SHARD_KINDS.map((shard) => (
            <label className="flex items-center gap-2" key={shard}>
              <input
                checked={shards.includes(shard)}
                onChange={(e) => toggleShard(shard, e.currentTarget.checked)}
                type="checkbox"
              />
              <span>{shard}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4 space-y-3 text-xs">
        <legend className="field-label">
          token budgets (per agent DO, in thousands of tokens)
        </legend>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="field-label">
              investigator/validator default max input (k)
            </span>
            <input
              className="input"
              inputMode="numeric"
              min={1}
              onChange={(e) => setDefaultMaxInputK(e.target.value)}
              placeholder="250"
              type="number"
              value={defaultMaxInputK}
            />
          </label>
          <label className="space-y-1">
            <span className="field-label">
              investigator/validator default max output (k)
            </span>
            <input
              className="input"
              inputMode="numeric"
              min={1}
              onChange={(e) => setDefaultMaxOutputK(e.target.value)}
              placeholder="50"
              type="number"
              value={defaultMaxOutputK}
            />
          </label>
        </div>
        <p className="text-fg-muted">
          applies to every investigator + validator subagent unless overridden
          below. submit_audit_finding / submit_validation always bypass these
          caps so subagents can always report back.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="field-label">coordinator max input (k)</span>
            <input
              className="input"
              inputMode="numeric"
              min={1}
              onChange={(e) => setCoordinatorMaxInputK(e.target.value)}
              placeholder="150"
              type="number"
              value={coordinatorMaxInputK}
            />
          </label>
          <label className="space-y-1">
            <span className="field-label">coordinator max output (k)</span>
            <input
              className="input"
              inputMode="numeric"
              min={1}
              onChange={(e) => setCoordinatorMaxOutputK(e.target.value)}
              placeholder="30"
              type="number"
              value={coordinatorMaxOutputK}
            />
          </label>
        </div>
        <p className="text-fg-muted">
          tighter cap for the coordinator since it should plan + delegate, not
          read code itself. dispatch_investigator, dispatch_validator, and
          finalize_audit always bypass this cap so the coordinator can finish
          spawning planned subagents and finalize even after running out of
          tokens.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="field-label">
              coordinator validation max input (k){" "}
              <span className="text-fg-muted">— optional</span>
            </span>
            <input
              className="input"
              inputMode="numeric"
              min={1}
              onChange={(e) => setValidationMaxInputK(e.target.value)}
              placeholder="defaults to coordinator max input"
              type="number"
              value={validationMaxInputK}
            />
          </label>
          <label className="space-y-1">
            <span className="field-label">
              coordinator validation max output (k){" "}
              <span className="text-fg-muted">— optional</span>
            </span>
            <input
              className="input"
              inputMode="numeric"
              min={1}
              onChange={(e) => setValidationMaxOutputK(e.target.value)}
              placeholder="defaults to coordinator max output"
              type="number"
              value={validationMaxOutputK}
            />
          </label>
        </div>
        <p className="text-fg-muted">
          coordinator usage counters reset to zero on its first
          dispatch_validator call, and these caps take over. lets the
          coordinator drive the entire validation phase even if investigation
          consumed its initial budget.
        </p>
        <button
          aria-expanded={budgetsOpen}
          className="id-link inline-flex items-center gap-1"
          onClick={() => setBudgetsOpen((v) => !v)}
          type="button"
        >
          {budgetsOpen ? "hide" : "show"} per-shard overrides
        </button>
        {budgetsOpen ? (
          <div className="overflow-x-auto rounded border border-border">
            <table className="table">
              <thead>
                <tr>
                  <th className="text-left">shard</th>
                  <th className="num">max input (k)</th>
                  <th className="num">max output (k)</th>
                </tr>
              </thead>
              <tbody>
                {AUDIT_SHARD_KINDS.map((shard) => {
                  const ov = shardOverrides[shard];
                  return (
                    <tr key={shard}>
                      <td className="font-mono">{shard}</td>
                      <td className="num">
                        <input
                          aria-label={`${shard} max input tokens (k)`}
                          className="input w-24"
                          inputMode="numeric"
                          min={1}
                          onChange={(e) =>
                            updateShardOverride(shard, {
                              maxInputK: e.target.value,
                            })
                          }
                          placeholder="default"
                          type="number"
                          value={ov.maxInputK}
                        />
                      </td>
                      <td className="num">
                        <input
                          aria-label={`${shard} max output tokens (k)`}
                          className="input w-24"
                          inputMode="numeric"
                          min={1}
                          onChange={(e) =>
                            updateShardOverride(shard, {
                              maxOutputK: e.target.value,
                            })
                          }
                          placeholder="default"
                          type="number"
                          value={ov.maxOutputK}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </fieldset>
    </Card>
  );
};

const computeDuration = (audit: AuditRow): string => {
  if (!audit.startedAt) {
    return "—";
  }
  const start = new Date(audit.startedAt).getTime();
  const end = audit.completedAt
    ? new Date(audit.completedAt).getTime()
    : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return "—";
  }
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

const AuditDetail = ({
  auditId,
  onOpenSession,
  onSelectFinding,
  selectedFindingId,
}: {
  auditId: string;
  onOpenSession?: ((sessionId: string) => void) | undefined;
  onSelectFinding: (id: string | null) => void;
  selectedFindingId: string | null;
}): React.JSX.Element => {
  const detail = useAuditQuery(auditId);
  const cancel = useCancelAuditMutation(auditId);
  const cleanup = useCleanupAuditMutation(auditId);
  const dismiss = useDismissFindingMutation(auditId);

  const audit = detail.data?.audit;
  const shards = detail.data?.shards ?? [];
  const findings = detail.data?.findings ?? [];
  const events = detail.data?.events ?? [];

  const [statusFilter, setStatusFilter] = useState<AuditFindingStatus | "all">(
    "all"
  );
  const [shardFilter, setShardFilter] = useState<ShardKind | "all">("all");
  const [vulnFilter, setVulnFilter] = useState<AuditVulnClass | "all">("all");

  const filteredFindings = useMemo(
    () =>
      findings.filter((f) => {
        if (statusFilter !== "all" && f.status !== statusFilter) {
          return false;
        }
        if (shardFilter !== "all" && f.shardKind !== shardFilter) {
          return false;
        }
        if (vulnFilter !== "all" && f.vulnClass !== vulnFilter) {
          return false;
        }
        return true;
      }),
    [findings, statusFilter, shardFilter, vulnFilter]
  );

  const selectedFinding = findings.find((f) => f.id === selectedFindingId);

  const canCancel =
    audit &&
    (audit.status === "running" ||
      audit.status === "pending" ||
      audit.status === "provisioning");

  const sessionLink = (
    sessionId: string | null | undefined
  ): React.ReactNode => {
    if (!sessionId) {
      return <span className="text-fg-muted">—</span>;
    }
    if (onOpenSession) {
      return (
        <button
          className="id-link break-all text-left font-mono text-xs"
          onClick={() => onOpenSession(sessionId)}
          title="open session"
          type="button"
        >
          {sessionId}
        </button>
      );
    }
    return <span className="break-all font-mono text-xs">{sessionId}</span>;
  };

  return (
    <Card
      actions={
        <div className="flex flex-wrap gap-2">
          {audit?.coordinatorSessionId && onOpenSession ? (
            <Button
              onClick={() =>
                audit.coordinatorSessionId &&
                onOpenSession(audit.coordinatorSessionId)
              }
              title="open the coordinator session to watch tool calls and chat live"
              variant="primary"
            >
              <Eye aria-hidden="true" size={12} />
              <span>watch coordinator</span>
            </Button>
          ) : null}
          <Button
            disabled={!canCancel || cancel.isPending}
            onClick={() => cancel.mutate()}
            variant="danger"
          >
            <Square aria-hidden="true" size={12} />
            <span>{cancel.isPending ? "stopping…" : "stop"}</span>
          </Button>
          <Button
            disabled={cleanup.isPending}
            onClick={() => cleanup.mutate()}
            variant="danger"
          >
            <Trash2 aria-hidden="true" size={12} />
            <span>cleanup</span>
          </Button>
        </div>
      }
      className="min-w-0"
      title="audit detail"
    >
      <ErrorState error={detail.error} title="detail unavailable" />
      <ErrorState error={cancel.error} title="stop failed" />
      <ErrorState error={cleanup.error} title="cleanup failed" />
      {!detail.data && <Spinner />}
      {audit && (
        <dl className="[&_dd]:wrap-break-word mb-4 grid grid-cols-1 gap-x-3 gap-y-2 text-xs sm:grid-cols-[minmax(0,auto)_1fr] sm:items-baseline [&_dd]:m-0 [&_dd]:min-w-0 [&_dt]:m-0">
          <DefinitionField label="id" mono>
            {audit.id}
          </DefinitionField>
          <DefinitionField label="status">
            <Badge status={audit.status} />
          </DefinitionField>
          <DefinitionField label="repo" mono>
            <a
              className="id-link break-all"
              href={audit.repoUrl}
              rel="noopener"
              target="_blank"
            >
              {audit.repoUrl}
            </a>
            {audit.ref ? (
              <span className="ml-2 text-fg-muted">@ {audit.ref}</span>
            ) : null}
          </DefinitionField>
          <DefinitionField label="mirror" mono>
            {audit.mirrorRepoFullName ?? "—"}
          </DefinitionField>
          <DefinitionField label="model" mono>
            {audit.modelProvider}/{audit.modelId}
          </DefinitionField>
          <DefinitionField label="coordinator session" mono>
            {sessionLink(audit.coordinatorSessionId)}
          </DefinitionField>
          <DefinitionField label="findings" numeric>
            {formatNumber(audit.validatedCount)} validated ·{" "}
            {formatNumber(audit.totalCandidates)} total ·{" "}
            {formatNumber(audit.highConfidenceCount)} high-conf
          </DefinitionField>
          <DefinitionField label="duration" numeric>
            {computeDuration(audit)}
          </DefinitionField>
          {audit.error ? (
            <DefinitionField label="error">{audit.error}</DefinitionField>
          ) : null}
        </dl>
      )}

      <ShardList onOpenSession={onOpenSession} shards={shards} />

      <div className="mb-2 flex flex-wrap items-end gap-2 text-xs">
        <label className="space-y-1">
          <span className="field-label">status</span>
          <select
            className="input"
            onChange={(e) =>
              setStatusFilter(e.target.value as AuditFindingStatus | "all")
            }
            value={statusFilter}
          >
            {FINDING_STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="field-label">shard</span>
          <select
            className="input"
            onChange={(e) =>
              setShardFilter(e.target.value as ShardKind | "all")
            }
            value={shardFilter}
          >
            <option value="all">all</option>
            {AUDIT_SHARD_KINDS.map((shard) => (
              <option key={shard} value={shard}>
                {shard}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="field-label">vuln class</span>
          <select
            className="input"
            onChange={(e) =>
              setVulnFilter(e.target.value as AuditVulnClass | "all")
            }
            value={vulnFilter}
          >
            <option value="all">all</option>
            {AUDIT_VULN_CLASSES.map((vc) => (
              <option key={vc} value={vc}>
                {vc}
              </option>
            ))}
          </select>
        </label>
      </div>

      <FindingsTable
        findings={filteredFindings}
        onSelect={onSelectFinding}
        selectedId={selectedFindingId}
      />

      {selectedFinding ? (
        <FindingDetail
          finding={selectedFinding}
          onClose={() => onSelectFinding(null)}
          onDismiss={(notes) =>
            dismiss.mutate({ findingId: selectedFinding.id, notes })
          }
          onOpenSession={onOpenSession}
          pendingDismiss={dismiss.isPending}
        />
      ) : null}

      {events.length > 0 ? (
        <details className="mt-4 rounded border border-border bg-bg-raised p-3 text-xs">
          <summary className="cursor-pointer text-fg-muted">
            event timeline ({events.length})
          </summary>
          <ol className="mt-2 space-y-2">
            {events.map((event) => (
              <li
                className="border-border border-l-2 pl-3"
                key={event.id}
                title={event.createdAt}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{event.kind}</span>
                  <span className="text-fg-muted">
                    {formatRelativeTime(event.createdAt)}
                  </span>
                </div>
                <div className="text-fg-muted">{event.message}</div>
                {event.details == null ? null : (
                  <JsonView
                    className="mt-2"
                    collapsedDepth={1}
                    maxHeight={160}
                    value={event.details}
                  />
                )}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </Card>
  );
};

const ShardList = ({
  onOpenSession,
  shards,
}: {
  onOpenSession?: ((sessionId: string) => void) | undefined;
  shards: AuditShardRow[];
}): React.JSX.Element | null => {
  if (shards.length === 0) {
    return null;
  }
  return (
    <div className="mb-4">
      <div className="field-label mb-2 text-xs">shards</div>
      <div className="grid gap-2 md:grid-cols-2">
        {shards.map((shard) => (
          <div
            className="rounded border border-border bg-bg-raised p-2 text-xs"
            key={shard.id}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono">{shard.kind}</span>
              <Badge status={shard.status} />
            </div>
            {shard.investigatorSessionId && onOpenSession ? (
              <button
                className="id-link mt-1 inline-flex items-center gap-1 font-mono text-[11px]"
                onClick={() =>
                  shard.investigatorSessionId &&
                  onOpenSession(shard.investigatorSessionId)
                }
                title="watch investigator session"
                type="button"
              >
                <Eye aria-hidden="true" size={10} />
                <span>watch investigator</span>
              </button>
            ) : null}
            {shard.summary ? (
              <p className="mt-1 text-fg-muted">{shard.summary}</p>
            ) : null}
            {shard.error ? (
              <p className="mt-1 text-status-failed">{shard.error}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

const FindingsTable = ({
  findings,
  onSelect,
  selectedId,
}: {
  findings: AuditFindingRow[];
  onSelect: (id: string | null) => void;
  selectedId: string | null;
}): React.JSX.Element => {
  if (findings.length === 0) {
    return (
      <EmptyState
        hint="adjust the filters or wait for the audit to surface findings."
        title="no findings"
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>finding</th>
            <th>vuln class</th>
            <th>severity</th>
            <th>shard</th>
            <th className="num">conf</th>
            <th>status</th>
            <th>updated</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => (
            <tr
              aria-selected={f.id === selectedId}
              className={f.id === selectedId ? "bg-bg-hover" : undefined}
              key={f.id}
            >
              <td className="max-w-72">
                <button
                  className={cn(
                    "id-link text-left",
                    findingStatusClass[f.status]
                  )}
                  onClick={() => onSelect(f.id)}
                  type="button"
                >
                  <span className="font-medium">{f.title}</span>
                </button>
                <div
                  className="text-fg-muted text-xs"
                  title={f.locations.map((l) => l.file).join(", ")}
                >
                  {f.locations[0]?.file ?? "—"}
                  {f.locations.length > 1 ? ` +${f.locations.length - 1}` : ""}
                </div>
              </td>
              <td className="font-mono text-fg-muted text-xs">{f.vulnClass}</td>
              <td className="font-mono text-fg-muted text-xs">{f.severity}</td>
              <td className="font-mono text-fg-muted text-xs">
                {f.shardKind ?? "—"}
              </td>
              <td className="num text-xs">
                {Math.round(f.confidence * PROGRESS_FACTOR)}%
              </td>
              <td>
                <span className={cn("text-xs", findingStatusClass[f.status])}>
                  {f.status}
                </span>
              </td>
              <td className="text-fg-muted text-xs">
                {formatRelativeTime(f.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const FindingDetail = ({
  finding,
  onClose,
  onDismiss,
  onOpenSession,
  pendingDismiss,
}: {
  finding: AuditFindingRow;
  onClose: () => void;
  onDismiss: (notes: string) => void;
  onOpenSession?: ((sessionId: string) => void) | undefined;
  pendingDismiss: boolean;
}): React.JSX.Element => {
  const [dismissNotes, setDismissNotes] = useState("");
  return (
    <div className="mt-4 space-y-3 rounded border border-border bg-bg-raised p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-sm">{finding.title}</div>
          <div className="text-fg-muted">
            {finding.vulnClass} · {finding.severity} ·{" "}
            {Math.round(finding.confidence * PROGRESS_FACTOR)}% confidence ·{" "}
            <span className={findingStatusClass[finding.status]}>
              {finding.status}
            </span>
          </div>
        </div>
        <Button onClick={onClose} variant="ghost">
          close
        </Button>
      </div>

      <div>
        <div className="field-label mb-1">description</div>
        <p className="whitespace-pre-wrap">{finding.description}</p>
      </div>

      <div>
        <div className="field-label mb-1">locations</div>
        <ul className="space-y-1">
          {finding.locations.map((loc) => (
            <li
              className="rounded bg-bg p-2 font-mono text-[11px]"
              key={`${loc.file}:${loc.function ?? ""}:${loc.lineStart ?? ""}`}
            >
              {loc.file}
              {loc.function ? ` :: ${loc.function}` : ""}
              {loc.lineStart
                ? ` (L${loc.lineStart}${loc.lineEnd ? `–${loc.lineEnd}` : ""})`
                : ""}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="field-label mb-1">evidence</div>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-bg p-2 text-[11px]">
          {finding.evidence}
        </pre>
      </div>

      {finding.pocSketch ? (
        <div>
          <div className="field-label mb-1">PoC sketch</div>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-bg p-2 text-[11px]">
            {finding.pocSketch}
          </pre>
        </div>
      ) : null}

      {finding.validationNotes ? (
        <div>
          <div className="field-label mb-1">validator notes</div>
          <p className="whitespace-pre-wrap">{finding.validationNotes}</p>
        </div>
      ) : null}

      {finding.validatorSessionId && onOpenSession ? (
        <div>
          <button
            className="id-link inline-flex items-center gap-1 font-mono"
            onClick={() =>
              finding.validatorSessionId &&
              onOpenSession(finding.validatorSessionId)
            }
            title="watch validator session"
            type="button"
          >
            <Eye aria-hidden="true" size={10} />
            <span>watch validator</span>
          </button>
        </div>
      ) : null}

      {finding.status === "dismissed" ? null : (
        <div className="space-y-2 border-border border-t pt-2">
          <label className="space-y-1">
            <span className="field-label">dismiss with notes</span>
            <textarea
              className="input"
              onChange={(e) => setDismissNotes(e.target.value)}
              placeholder="why is this not a real finding?"
              rows={2}
              value={dismissNotes}
            />
          </label>
          <Button
            disabled={pendingDismiss || !dismissNotes.trim()}
            onClick={() => onDismiss(dismissNotes.trim())}
            variant="danger"
          >
            <Trash2 aria-hidden="true" size={12} />
            <span>{pendingDismiss ? "dismissing…" : "dismiss finding"}</span>
          </Button>
        </div>
      )}
    </div>
  );
};
