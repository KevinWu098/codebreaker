import type {
  BenchmarkRunRow,
  CveFollowupDetailResponse,
  CveFollowupStageRow,
} from "@codebreaker/benchmark-runner/schemas";
import {
  MODEL_OPTIONS,
  MODEL_OPTIONS_BY_PROVIDER,
  MODEL_PROVIDERS,
} from "@codebreaker/shared/lib/models";
import type {
  AuditDetailResponse,
  AuditFindingRow,
  AuditRow,
  AuditShardRow,
  CreateAuditRequest,
} from "@codebreaker/shared/schemas/audits";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  ChevronRight,
  ExternalLink,
  Eye,
  FlaskConical,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Play,
  Radio,
  Search,
  ShieldAlert,
  ShieldCheck,
  Workflow,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { DevinWord } from "@/components/devin-word";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Spinner } from "@/components/spinner";
import {
  useCreateAuditMutation,
  useCreateCveFollowupMutation,
} from "@/hooks/mutations";
import {
  useAuditQuery,
  useAuditsQuery,
  useBenchmarkRunsQuery,
  useCveFollowupQuery,
  useCveFollowupsListQuery,
} from "@/hooks/queries";
import { isAuthorized, useConnection } from "@/lib/connection";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const PERCENT = 100;
const ID_DISPLAY_LENGTH = 8;
const PHASE_SEGMENT = 1 / 3;

type AuditPhaseKey = "orchestrator" | "subagents" | "validator";
type AuditPhaseStatus = "idle" | "running" | "completed" | "failed" | "skipped";

interface AuditPhase {
  description: string;
  key: AuditPhaseKey;
  label: string;
  /** 0..1 */
  progress: number;
  status: AuditPhaseStatus;
}

interface DemoPanelProps {
  followupRunId: string | null;
  onSelectAudit: (id: string | null) => void;
  onSelectFollowupRun: (id: string | null) => void;
  selectedAuditId: string | null;
}

export const DemoPanel = ({
  followupRunId,
  onSelectAudit,
  onSelectFollowupRun,
  selectedAuditId,
}: DemoPanelProps): React.JSX.Element => {
  const connection = useConnection();
  const enabled = isAuthorized(connection);

  return (
    <div className="space-y-5">
      <PageHeader
        description={
          <span className="text-sm">
            audit identifies → <DevinWord /> validates &amp; fixes → github
            merges
          </span>
        }
        title="end to end"
      />

      {!enabled && (
        <EmptyState
          hint="set a jwt in the sidebar to load audits and follow-ups."
          title="no token configured"
        />
      )}

      {enabled && (
        <DemoSelectors
          onSelectAudit={onSelectAudit}
          onSelectFollowupRun={onSelectFollowupRun}
          selectedAuditId={selectedAuditId}
          selectedFollowupRunId={followupRunId}
        />
      )}

      {enabled && (
        <div className="grid gap-4 lg:grid-cols-3">
          <AuditColumn auditId={selectedAuditId} />
          <DevinColumn runId={followupRunId} />
          <GithubColumn runId={followupRunId} />
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

const AUDITS_LIMIT = 50;
const BENCHMARK_RUNS_LIMIT = 50;

type ControlMode = "select" | "new";

const CONTROL_MODE_OPTIONS: ReadonlyArray<{
  label: string;
  value: ControlMode;
}> = [
  { label: "select existing", value: "select" },
  { label: "start new", value: "new" },
];

const DemoSelectors = ({
  onSelectAudit,
  onSelectFollowupRun,
  selectedAuditId,
  selectedFollowupRunId,
}: {
  onSelectAudit: (id: string | null) => void;
  onSelectFollowupRun: (id: string | null) => void;
  selectedAuditId: string | null;
  selectedFollowupRunId: string | null;
}): React.JSX.Element => {
  const [auditMode, setAuditMode] = useState<ControlMode>("select");
  const [followupMode, setFollowupMode] = useState<ControlMode>("select");

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <ControlCard
        icon={<ShieldAlert aria-hidden="true" size={11} />}
        label="audit run"
        mode={auditMode}
        onModeChange={setAuditMode}
      >
        {auditMode === "select" ? (
          <AuditSelectField
            onSelectAudit={onSelectAudit}
            selectedAuditId={selectedAuditId}
          />
        ) : (
          <AuditStartForm
            onCreated={(id) => {
              onSelectAudit(id);
              setAuditMode("select");
            }}
          />
        )}
      </ControlCard>

      <ControlCard
        icon={<GitMerge aria-hidden="true" size={11} />}
        label="cve follow-up"
        mode={followupMode}
        onModeChange={setFollowupMode}
      >
        {followupMode === "select" ? (
          <FollowupSelectField
            onSelectFollowupRun={onSelectFollowupRun}
            selectedFollowupRunId={selectedFollowupRunId}
          />
        ) : (
          <FollowupStartForm
            onCreated={(runId) => {
              onSelectFollowupRun(runId);
              setFollowupMode("select");
            }}
          />
        )}
      </ControlCard>
    </div>
  );
};

const ControlCard = ({
  children,
  icon,
  label,
  mode,
  onModeChange,
}: {
  children: ReactNode;
  icon: ReactNode;
  label: string;
  mode: ControlMode;
  onModeChange: (mode: ControlMode) => void;
}): React.JSX.Element => (
  <div className="space-y-2 rounded border border-border bg-bg-raised p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="field-label inline-flex items-center gap-1">
        {icon}
        <span>{label}</span>
      </span>
      <Segmented
        ariaLabel={`${label} mode`}
        onValueChange={onModeChange}
        options={CONTROL_MODE_OPTIONS}
        value={mode}
      />
    </div>
    {children}
  </div>
);

const Segmented = <T extends string>({
  ariaLabel,
  onValueChange,
  options,
  value,
}: {
  ariaLabel: string;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<{ label: string; value: T }>;
  value: T;
}): React.JSX.Element => (
  <div
    aria-label={ariaLabel}
    className="inline-flex gap-0.5 rounded border border-border bg-bg p-0.5"
    role="tablist"
  >
    {options.map((option) => {
      const selected = option.value === value;
      return (
        <button
          aria-selected={selected}
          className={cn(
            "rounded px-2 py-0.5 text-[10px] lowercase tracking-wide transition-colors",
            selected
              ? "bg-bg-overlay font-medium text-fg"
              : "text-fg-muted hover:text-fg"
          )}
          key={option.value}
          onClick={() => onValueChange(option.value)}
          role="tab"
          type="button"
        >
          {option.label}
        </button>
      );
    })}
  </div>
);

const AuditSelectField = ({
  onSelectAudit,
  selectedAuditId,
}: {
  onSelectAudit: (id: string | null) => void;
  selectedAuditId: string | null;
}): React.JSX.Element => {
  const audits = useAuditsQuery({ limit: AUDITS_LIMIT, offset: 0 });
  return (
    <select
      aria-label="select an audit"
      className="input"
      onChange={(event) =>
        onSelectAudit(event.target.value === "" ? null : event.target.value)
      }
      value={selectedAuditId ?? ""}
    >
      <option value="">— pick an audit —</option>
      {(audits.data?.audits ?? []).map((row) => (
        <option key={row.id} value={row.id}>
          {row.id.slice(0, ID_DISPLAY_LENGTH)} · {row.title ?? row.repoUrl}
        </option>
      ))}
    </select>
  );
};

const FollowupSelectField = ({
  onSelectFollowupRun,
  selectedFollowupRunId,
}: {
  onSelectFollowupRun: (id: string | null) => void;
  selectedFollowupRunId: string | null;
}): React.JSX.Element => {
  const followups = useCveFollowupsListQuery();
  return (
    <select
      aria-label="select a follow-up"
      className="input"
      onChange={(event) =>
        onSelectFollowupRun(
          event.target.value === "" ? null : event.target.value
        )
      }
      value={selectedFollowupRunId ?? ""}
    >
      <option value="">— pick a follow-up —</option>
      {(followups.data?.followups ?? []).map((row) => (
        <option key={row.followup.id} value={row.followup.runId}>
          {row.followup.id.slice(0, ID_DISPLAY_LENGTH)} ·{" "}
          {row.followup.repoName ?? row.followup.taskId}
        </option>
      ))}
    </select>
  );
};

// ---------------------------------------------------------------------------
// Start forms
// ---------------------------------------------------------------------------

const DEFAULT_AUDIT_MODEL = MODEL_OPTIONS_BY_PROVIDER.kimi[0];
const modelOptionValue = (option: { id: string; provider: string }): string =>
  `${option.provider}/${option.id}`;

const AuditStartForm = ({
  onCreated,
}: {
  onCreated: (id: string) => void;
}): React.JSX.Element => {
  const create = useCreateAuditMutation();
  const [repoUrl, setRepoUrl] = useState("");
  const [title, setTitle] = useState("");
  const [modelValue, setModelValue] = useState(
    modelOptionValue(DEFAULT_AUDIT_MODEL)
  );

  const submit = async (): Promise<void> => {
    const trimmedUrl = repoUrl.trim();
    const selected = MODEL_OPTIONS.find(
      (option) => modelOptionValue(option) === modelValue
    );
    if (!(trimmedUrl && selected)) {
      return;
    }
    const trimmedTitle = title.trim();
    const request: CreateAuditRequest = {
      autoStart: true,
      investigatorTimeoutSeconds: 600,
      maxConcurrentInvestigators: 4,
      minConfidence: 0.7,
      model: { id: selected.id, provider: selected.provider },
      repoUrl: trimmedUrl,
      sandboxProfile: "recon",
      timeoutSeconds: 2400,
      validatorTimeoutSeconds: 300,
      ...(trimmedTitle ? { title: trimmedTitle } : {}),
    };
    try {
      const response = await create.mutateAsync(request);
      onCreated(response.audit.id);
      setRepoUrl("");
      setTitle("");
    } catch {
      // toast surfaced by mutation onError
    }
  };

  const disabled = create.isPending || repoUrl.trim() === "";

  return (
    <div className="space-y-2">
      <div className="grid gap-2">
        <label className="space-y-1 text-xs">
          <span className="field-label">repository url</span>
          <input
            className="input"
            onChange={(event) => setRepoUrl(event.target.value)}
            placeholder="https://github.com/owner/repo"
            type="url"
            value={repoUrl}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="field-label">title (optional)</span>
          <input
            className="input"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="short label"
            value={title}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="field-label">model</span>
          <select
            className="input"
            onChange={(event) => setModelValue(event.target.value)}
            value={modelValue}
          >
            {MODEL_PROVIDERS.map((provider) => (
              <optgroup key={provider} label={provider}>
                {MODEL_OPTIONS_BY_PROVIDER[provider].map((option) => (
                  <option
                    key={`${provider}/${option.id}`}
                    value={modelOptionValue(option)}
                  >
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-fg-muted">
          coordinator + investigators auto-start with default budgets.
        </p>
        <Button disabled={disabled} onClick={submit} variant="primary">
          <Play aria-hidden="true" size={12} />
          <span>{create.isPending ? "starting…" : "start audit"}</span>
        </Button>
      </div>
      <ErrorState error={create.error} title="audit start failed" />
    </div>
  );
};

const FollowupStartForm = ({
  onCreated,
}: {
  onCreated: (runId: string) => void;
}): React.JSX.Element => {
  const runs = useBenchmarkRunsQuery({
    limit: BENCHMARK_RUNS_LIMIT,
    offset: 0,
    status: "completed",
  });
  const existingFollowups = useCveFollowupsListQuery();
  const followupRunIds = useMemo(
    () =>
      new Set(
        (existingFollowups.data?.followups ?? []).map(
          (entry) => entry.followup.runId
        )
      ),
    [existingFollowups.data]
  );
  const eligibleRuns: readonly BenchmarkRunRow[] = useMemo(
    () => (runs.data?.runs ?? []).filter((run) => !followupRunIds.has(run.id)),
    [runs.data, followupRunIds]
  );
  const [selectedRunId, setSelectedRunId] = useState("");
  const create = useCreateCveFollowupMutation(selectedRunId);

  const submit = async (): Promise<void> => {
    if (!selectedRunId) {
      return;
    }
    try {
      const response = await create.mutateAsync({ force: false });
      onCreated(response.followup.runId);
      setSelectedRunId("");
    } catch {
      // toast surfaced by mutation onError
    }
  };

  const disabled = create.isPending || selectedRunId === "";

  return (
    <div className="space-y-2">
      <label className="space-y-1 text-xs">
        <span className="field-label">benchmark run</span>
        <select
          className="input"
          onChange={(event) => setSelectedRunId(event.target.value)}
          value={selectedRunId}
        >
          <option value="">— pick a completed benchmark run —</option>
          {eligibleRuns.map((run) => (
            <option key={run.id} value={run.id}>
              {run.id.slice(0, ID_DISPLAY_LENGTH)} · {run.taskId} ·{" "}
              {run.modelProvider}/{run.modelId}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-fg-muted">
          follow-ups attach to a completed benchmark run; pick one to dispatch{" "}
          <DevinWord /> reproduction → fix.
        </p>
        <Button disabled={disabled} onClick={submit} variant="primary">
          <Play aria-hidden="true" size={12} />
          <span>{create.isPending ? "starting…" : "start follow-up"}</span>
        </Button>
      </div>
      <ErrorState error={create.error} title="follow-up start failed" />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Stage column wrapper (shared chrome for all three columns)
// ---------------------------------------------------------------------------

interface StageColumnProps {
  active: boolean;
  badge?: ReactNode;
  children: ReactNode;
  description: string;
  icon: ReactNode;
  /** Two-character zero-padded step number, e.g. "01". */
  step: string;
  subtitle: string;
  title: string;
}

const StageColumn = ({
  active,
  badge,
  children,
  description,
  icon,
  step,
  subtitle,
  title,
}: StageColumnProps): React.JSX.Element => (
  <section
    className={cn(
      "relative flex min-w-0 flex-col rounded-md border bg-bg-raised transition-all duration-300",
      active
        ? "demo-glow border-accent/60"
        : "border-border hover:border-border-strong"
    )}
  >
    {active ? (
      <span
        aria-hidden="true"
        className="absolute -top-2 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-accent px-2 py-0.5 font-medium font-mono text-[10px] text-bg uppercase tracking-wider"
      >
        <Radio className="animate-pulse" size={10} />
        live
      </span>
    ) : null}
    <header className="flex items-start justify-between gap-3 border-border border-b px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md font-mono text-[13px] tabular-nums",
            active
              ? "bg-accent/15 font-semibold text-accent"
              : "bg-bg-overlay text-fg-muted"
          )}
        >
          {step}
        </div>
        <div className="min-w-0 space-y-0.5">
          <div className="font-medium text-[10px] text-fg-subtle uppercase tracking-[0.15em]">
            {subtitle}
          </div>
          <h2 className="flex items-center gap-1.5 font-semibold text-base text-fg leading-tight">
            <span className={cn(active ? "text-accent" : "text-fg-muted")}>
              {icon}
            </span>
            <span className="lowercase">{title}</span>
          </h2>
          <p className="text-[11px] text-fg-muted leading-snug">
            {description}
          </p>
        </div>
      </div>
      {badge ? <div className="shrink-0">{badge}</div> : null}
    </header>
    <div className="space-y-4 p-4">{children}</div>
  </section>
);

// ---------------------------------------------------------------------------
// Audit phase derivation (unchanged from previous version)
// ---------------------------------------------------------------------------

const isAuditTerminal = (status: AuditRow["status"]): boolean =>
  status === "completed" ||
  status === "failed" ||
  status === "cancelled" ||
  status === "cleaned" ||
  status === "cleaning_up";

const computeOrchestratorPhase = (
  audit: AuditRow,
  shards: readonly AuditShardRow[]
): AuditPhase => {
  const shardsPlanned = shards.length > 0;
  const anyShardStarted = shards.some((shard) => shard.status !== "planned");

  let progress = 0;
  if (shardsPlanned) {
    progress = anyShardStarted ? 1 : 0.5;
  } else if (audit.status === "running") {
    progress = 0.15;
  }

  let status: AuditPhaseStatus = "idle";
  if (audit.status === "failed" && !shardsPlanned) {
    status = "failed";
  } else if (anyShardStarted || isAuditTerminal(audit.status)) {
    status = "completed";
  } else if (audit.status === "running" || audit.status === "provisioning") {
    status = "running";
  }

  return {
    description: "coordinator plans shards and dispatches investigators.",
    key: "orchestrator",
    label: "orchestrator",
    progress,
    status,
  };
};

const computeSubagentsPhase = (
  audit: AuditRow,
  shards: readonly AuditShardRow[]
): AuditPhase => {
  if (shards.length === 0) {
    return {
      description: "investigator subagents read code and surface candidates.",
      key: "subagents",
      label: "subagents",
      progress: 0,
      status: audit.status === "failed" ? "failed" : "idle",
    };
  }

  const totalShards = shards.length;
  const investigationDone = shards.filter(
    (shard) =>
      shard.status === "validating" ||
      shard.status === "completed" ||
      shard.status === "failed" ||
      shard.status === "skipped"
  ).length;
  const investigating = shards.some(
    (shard) => shard.status === "investigating"
  );

  const progress = investigationDone / totalShards;

  let status: AuditPhaseStatus = "idle";
  if (investigationDone === totalShards) {
    status = "completed";
  } else if (investigating) {
    status = "running";
  } else if (audit.status === "failed") {
    status = "failed";
  }

  return {
    description: "investigator subagents read code and surface candidates.",
    key: "subagents",
    label: "subagents",
    progress,
    status,
  };
};

const computeValidatorPhase = (
  audit: AuditRow,
  shards: readonly AuditShardRow[],
  findings: readonly AuditFindingRow[]
): AuditPhase => {
  const allShardInvestigationDone =
    shards.length > 0 &&
    shards.every(
      (shard) =>
        shard.status === "validating" ||
        shard.status === "completed" ||
        shard.status === "failed" ||
        shard.status === "skipped"
    );

  const validating = shards.some((shard) => shard.status === "validating");
  const totalFindings = findings.length;
  const resolvedFindings = findings.filter(
    (finding) => finding.status !== "candidate"
  ).length;

  let progress = 0;
  if (audit.status === "completed") {
    progress = 1;
  } else if (totalFindings > 0) {
    progress = resolvedFindings / totalFindings;
  } else if (allShardInvestigationDone) {
    progress = 0.25;
  } else if (validating) {
    progress = 0.1;
  }

  let status: AuditPhaseStatus = "idle";
  if (audit.status === "completed") {
    status = "completed";
  } else if (audit.status === "failed") {
    status = "failed";
  } else if (
    validating ||
    (totalFindings > 0 && resolvedFindings < totalFindings)
  ) {
    status = "running";
  } else if (allShardInvestigationDone && totalFindings === 0) {
    status = "running";
  }

  return {
    description: "validator confirms or dismisses each candidate.",
    key: "validator",
    label: "validator",
    progress,
    status,
  };
};

const deriveAuditPhases = (
  data: AuditDetailResponse | undefined
): AuditPhase[] => {
  if (!data) {
    return [
      {
        description: "coordinator plans shards and dispatches investigators.",
        key: "orchestrator",
        label: "orchestrator",
        progress: 0,
        status: "idle",
      },
      {
        description: "investigator subagents read code and surface candidates.",
        key: "subagents",
        label: "subagents",
        progress: 0,
        status: "idle",
      },
      {
        description: "validator confirms or dismisses each candidate.",
        key: "validator",
        label: "validator",
        progress: 0,
        status: "idle",
      },
    ];
  }
  return [
    computeOrchestratorPhase(data.audit, data.shards),
    computeSubagentsPhase(data.audit, data.shards),
    computeValidatorPhase(data.audit, data.shards, data.findings),
  ];
};

const overallAuditProgress = (phases: AuditPhase[]): number =>
  phases.reduce(
    (acc, phase) => acc + Math.min(1, Math.max(0, phase.progress)),
    0
  ) * PHASE_SEGMENT;

// ---------------------------------------------------------------------------
// Phase status visuals
// ---------------------------------------------------------------------------

const phaseFillClass = (status: AuditPhaseStatus): string => {
  switch (status) {
    case "completed": {
      return "bg-status-completed";
    }
    case "running": {
      return "bg-status-running";
    }
    case "failed": {
      return "bg-status-failed";
    }
    default: {
      return "bg-fg-subtle/30";
    }
  }
};

const phaseTextClass = (status: AuditPhaseStatus): string => {
  switch (status) {
    case "completed": {
      return "text-status-completed";
    }
    case "running": {
      return "text-status-running";
    }
    case "failed": {
      return "text-status-failed";
    }
    default: {
      return "text-fg-subtle";
    }
  }
};

const phaseRowClass = (status: AuditPhaseStatus): string => {
  switch (status) {
    case "running": {
      return "demo-active-row bg-status-running/5";
    }
    case "completed": {
      return "demo-completed-row bg-status-completed/5";
    }
    case "failed": {
      return "demo-failed-row bg-status-failed/5";
    }
    default: {
      return "border border-border bg-bg";
    }
  }
};

const auditPhaseIcon: Record<AuditPhaseKey, LucideIcon> = {
  orchestrator: Workflow,
  subagents: Search,
  validator: ShieldCheck,
};

const devinStageIcon: Record<"fix" | "repro", LucideIcon> = {
  fix: Wrench,
  repro: FlaskConical,
};

const PhaseIdentityIcon = ({
  Icon,
  status,
}: {
  Icon: LucideIcon;
  status: AuditPhaseStatus;
}): React.JSX.Element => (
  <Icon aria-hidden="true" className={phaseTextClass(status)} size={16} />
);

// ---------------------------------------------------------------------------
// Audit column
// ---------------------------------------------------------------------------

const AuditColumn = ({
  auditId,
}: {
  auditId: string | null;
}): React.JSX.Element => {
  const enabled = Boolean(auditId);
  const detail = useAuditQuery(auditId ?? "", { enabled });
  const phases = useMemo(() => deriveAuditPhases(detail.data), [detail.data]);
  const overall = overallAuditProgress(phases);

  const audit = detail.data?.audit;
  const activePhase = phases.find((phase) => phase.status === "running");
  const isLive = Boolean(activePhase);

  return (
    <StageColumn
      active={isLive}
      badge={audit ? <Badge status={audit.status} /> : null}
      description="orchestrator → subagents → validator"
      icon={<ShieldAlert aria-hidden="true" size={16} />}
      step="01"
      subtitle="identification"
      title="audit loop"
    >
      {!auditId && (
        <EmptyState
          hint="pick an audit at the top of the page."
          title="no audit selected"
        />
      )}
      {auditId && detail.isPending && <Spinner />}
      <ErrorState error={detail.error} title="audit unavailable" />
      {audit ? (
        <div className="space-y-4">
          <AuditHeadline audit={audit} />

          <SegmentedProgress
            activeLabel={activePhase?.label}
            overall={overall}
            phases={phases}
          />

          <div className="space-y-2.5">
            {phases.map((phase) => (
              <PhaseRow key={phase.key} phase={phase} />
            ))}
          </div>

          <AuditFindingsSummary
            findings={detail.data?.findings ?? []}
            shards={detail.data?.shards ?? []}
          />
        </div>
      ) : null}
    </StageColumn>
  );
};

const AuditHeadline = ({ audit }: { audit: AuditRow }): React.JSX.Element => (
  <div className="space-y-0.5">
    <div className="truncate font-medium text-fg text-sm" title={audit.repoUrl}>
      {audit.title ?? audit.repoUrl}
    </div>
    <div
      className="truncate font-mono text-[11px] text-fg-muted"
      title={audit.id}
    >
      {audit.id}
    </div>
  </div>
);

const SegmentedProgress = ({
  activeLabel,
  overall,
  phases,
}: {
  activeLabel?: string | undefined;
  overall: number;
  phases: AuditPhase[];
}): React.JSX.Element => (
  <div className="space-y-1.5">
    <div
      aria-label="audit progress"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(overall * PERCENT)}
      className="flex h-2.5 overflow-hidden rounded bg-bg-overlay"
      role="progressbar"
    >
      {phases.map((phase) => (
        <div
          className="relative flex-1 border-border border-r last:border-r-0"
          key={phase.key}
        >
          <div
            className={cn(
              "h-full transition-all duration-700 ease-out",
              phaseFillClass(phase.status)
            )}
            style={{
              width: `${Math.min(1, Math.max(0, phase.progress)) * PERCENT}%`,
            }}
          />
          {phase.status === "running" ? (
            <div className="demo-shimmer pointer-events-none absolute inset-0" />
          ) : null}
        </div>
      ))}
    </div>
    <div className="flex items-center justify-between text-[11px]">
      {activeLabel ? (
        <span className="inline-flex items-center gap-1.5 font-medium text-status-running uppercase tracking-wider">
          <span className="status-dot animate-pulse bg-status-running" />
          <span>now · {activeLabel}</span>
        </span>
      ) : (
        <span className="text-fg-muted uppercase tracking-wider">progress</span>
      )}
      <span className="font-mono text-fg tabular-nums">
        {Math.round(overall * PERCENT)}%
      </span>
    </div>
  </div>
);

const PhaseRow = ({ phase }: { phase: AuditPhase }): React.JSX.Element => {
  const active = phase.status === "running";
  return (
    <div
      className={cn(
        "rounded-md p-3 transition-all duration-300",
        phaseRowClass(phase.status)
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <PhaseIdentityIcon
            Icon={auditPhaseIcon[phase.key]}
            status={phase.status}
          />
          <span
            className={cn(
              "font-medium text-sm lowercase",
              active ? "text-status-running" : "text-fg"
            )}
          >
            {phase.label}
          </span>
          {active ? (
            <span className="rounded bg-status-running/15 px-1.5 py-0.5 font-medium text-[9px] text-status-running uppercase tracking-wider">
              active
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "font-mono text-xs tabular-nums",
            active ? "text-status-running" : "text-fg-muted"
          )}
        >
          {Math.round(Math.min(1, Math.max(0, phase.progress)) * PERCENT)}%
        </span>
      </div>
      <div className="relative mb-2 h-1.5 overflow-hidden rounded bg-bg-overlay">
        <div
          className={cn(
            "h-full transition-all duration-700 ease-out",
            phaseFillClass(phase.status)
          )}
          style={{
            width: `${Math.min(1, Math.max(0, phase.progress)) * PERCENT}%`,
          }}
        />
        {active ? (
          <div className="demo-shimmer pointer-events-none absolute inset-0" />
        ) : null}
      </div>
      <p className="text-[12px] text-fg-muted leading-snug">
        {phase.description}
      </p>
    </div>
  );
};

const AuditFindingsSummary = ({
  findings,
  shards,
}: {
  findings: readonly AuditFindingRow[];
  shards: readonly AuditShardRow[];
}): React.JSX.Element | null => {
  if (findings.length === 0 && shards.length === 0) {
    return null;
  }
  const validated = findings.filter((f) => f.status === "validated").length;
  const candidate = findings.filter((f) => f.status === "candidate").length;
  const dismissed = findings.filter((f) => f.status === "dismissed").length;

  return (
    <div className="rounded-md border border-border bg-bg p-3">
      <div className="field-label mb-2">tally</div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <TallyCell label="shards" tone="default" value={shards.length} />
        <TallyCell label="validated" tone="completed" value={validated} />
        <TallyCell label="candidate" tone="default" value={candidate} />
        <TallyCell label="dismissed" tone="muted" value={dismissed} />
      </div>
    </div>
  );
};

const tallyToneClass = (tone: "completed" | "default" | "muted"): string => {
  switch (tone) {
    case "completed": {
      return "text-status-completed";
    }
    case "muted": {
      return "text-fg-muted";
    }
    default: {
      return "text-fg";
    }
  }
};

const TallyCell = ({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "completed" | "default" | "muted";
  value: number;
}): React.JSX.Element => {
  const toneClass = tallyToneClass(tone);
  return (
    <div className="space-y-0.5">
      <div
        className={cn(
          "font-mono font-semibold text-lg tabular-nums",
          toneClass
        )}
      >
        {value}
      </div>
      <div className="text-[10px] text-fg-muted uppercase tracking-wider">
        {label}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Devin column
// ---------------------------------------------------------------------------

const stageProgress = (stage: CveFollowupStageRow): number => {
  switch (stage.status) {
    case "succeeded":
    case "succeeded_weak": {
      return 1;
    }
    case "validating": {
      return 0.85;
    }
    case "dispatched": {
      return 0.5;
    }
    case "pending": {
      return 0.1;
    }
    case "failed":
    case "cancelled":
    case "skipped": {
      return 0;
    }
    default: {
      return 0;
    }
  }
};

const stagePhaseStatus = (stage: CveFollowupStageRow): AuditPhaseStatus => {
  switch (stage.status) {
    case "succeeded":
    case "succeeded_weak": {
      return "completed";
    }
    case "failed":
    case "cancelled": {
      return "failed";
    }
    case "skipped": {
      return "skipped";
    }
    case "dispatched":
    case "validating":
    case "pending": {
      return "running";
    }
    default: {
      return "idle";
    }
  }
};

const DevinColumn = ({
  runId,
}: {
  runId: string | null;
}): React.JSX.Element => {
  const followup = useCveFollowupQuery(runId ?? "", {
    enabled: Boolean(runId),
  });
  const data = followup.data;

  const stagesByKind = useMemo(() => {
    const map = new Map<string, CveFollowupStageRow>();
    for (const stage of data?.stages ?? []) {
      map.set(stage.kind, stage);
    }
    return map;
  }, [data]);

  const repro = stagesByKind.get("repro");
  const fix = stagesByKind.get("fix");
  const overall =
    ((repro ? stageProgress(repro) : 0) + (fix ? stageProgress(fix) : 0)) / 2;

  const activeStage = (() => {
    if (repro && stagePhaseStatus(repro) === "running") {
      return "repro";
    }
    if (fix && stagePhaseStatus(fix) === "running") {
      return "fix";
    }
    return null;
  })();

  return (
    <StageColumn
      active={Boolean(activeStage)}
      badge={data ? <Badge status={data.followup.status} /> : null}
      description="reproduce, then patch"
      icon={<Bot aria-hidden="true" size={16} />}
      step="02"
      subtitle="validation & fix"
      title="devin"
    >
      {!runId && (
        <EmptyState
          hint="pick a cve follow-up at the top of the page."
          title="no follow-up selected"
        />
      )}
      {runId && followup.isLoading && <Spinner />}
      <ErrorState error={followup.error} title="follow-up unavailable" />
      {data ? (
        <div className="space-y-4">
          <DevinHeadline followup={data.followup} />

          <DevinTwoStepProgress
            activeStage={activeStage}
            fix={fix}
            overall={overall}
            repro={repro}
          />

          <div className="space-y-2.5">
            <DevinStageBox kind="repro" stage={repro} title="reproduction" />
            <DevinStageBox kind="fix" stage={fix} title="fix" />
          </div>
        </div>
      ) : null}
    </StageColumn>
  );
};

const DevinHeadline = ({
  followup,
}: {
  followup: CveFollowupDetailResponse["followup"];
}): React.JSX.Element => (
  <div className="space-y-0.5">
    <div className="truncate font-medium text-fg text-sm" title={followup.id}>
      {followup.repoName ?? followup.taskId}
    </div>
    <div
      className="truncate font-mono text-[11px] text-fg-muted"
      title={followup.ghsaId}
    >
      {followup.ghsaId}
    </div>
  </div>
);

const DevinTwoStepProgress = ({
  activeStage,
  fix,
  overall,
  repro,
}: {
  activeStage: "fix" | "repro" | null;
  fix: CveFollowupStageRow | undefined;
  overall: number;
  repro: CveFollowupStageRow | undefined;
}): React.JSX.Element => (
  <div className="space-y-1.5">
    <div
      aria-label="devin progress"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(overall * PERCENT)}
      className="flex h-2.5 overflow-hidden rounded bg-bg-overlay"
      role="progressbar"
    >
      {[
        { label: "repro", stage: repro },
        { label: "fix", stage: fix },
      ].map(({ label, stage }) => {
        const status = stage ? stagePhaseStatus(stage) : "idle";
        const value = stage ? stageProgress(stage) : 0;
        return (
          <div
            className="relative flex-1 border-border border-r last:border-r-0"
            key={label}
          >
            <div
              className={cn(
                "h-full transition-all duration-700 ease-out",
                phaseFillClass(status)
              )}
              style={{ width: `${value * PERCENT}%` }}
            />
            {status === "running" ? (
              <div className="demo-shimmer pointer-events-none absolute inset-0" />
            ) : null}
          </div>
        );
      })}
    </div>
    <div className="flex items-center justify-between text-[11px]">
      {activeStage ? (
        <span className="inline-flex items-center gap-1.5 font-medium text-status-running uppercase tracking-wider">
          <span className="status-dot animate-pulse bg-status-running" />
          <span>now · {activeStage}</span>
        </span>
      ) : (
        <span className="text-fg-muted uppercase tracking-wider">progress</span>
      )}
      <span className="font-mono text-fg tabular-nums">
        {Math.round(overall * PERCENT)}%
      </span>
    </div>
  </div>
);

const DevinStageBox = ({
  kind,
  stage,
  title,
}: {
  kind: "fix" | "repro";
  stage: CveFollowupStageRow | undefined;
  title: string;
}): React.JSX.Element => {
  const status = stage ? stagePhaseStatus(stage) : "idle";
  const progress = stage ? stageProgress(stage) : 0;
  const active = status === "running";
  const description =
    kind === "repro"
      ? "devin opens a sandbox, reproduces the bug, files a repro PR."
      : "devin patches the code, validates the fix, files a fix PR.";

  return (
    <div
      className={cn(
        "rounded-md p-3 transition-all duration-300",
        phaseRowClass(status)
      )}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <PhaseIdentityIcon Icon={devinStageIcon[kind]} status={status} />
          <span
            className={cn(
              "inline-flex items-center gap-1 font-medium text-sm",
              active ? "text-status-running" : "text-fg"
            )}
          >
            <DevinWord />
            <span className="text-fg-subtle">·</span>
            <span className="lowercase">{title}</span>
          </span>
          {active ? (
            <span className="rounded bg-status-running/15 px-1.5 py-0.5 font-medium text-[9px] text-status-running uppercase tracking-wider">
              active
            </span>
          ) : null}
        </span>
        {stage ? (
          <Badge status={stage.status} />
        ) : (
          <span className="text-[11px] text-fg-subtle">not yet dispatched</span>
        )}
      </div>
      <div className="relative mb-2 h-1.5 overflow-hidden rounded bg-bg-overlay">
        <div
          className={cn(
            "h-full transition-all duration-700 ease-out",
            phaseFillClass(status)
          )}
          style={{ width: `${progress * PERCENT}%` }}
        />
        {active ? (
          <div className="demo-shimmer pointer-events-none absolute inset-0" />
        ) : null}
      </div>
      <p className="mb-2 text-[12px] text-fg-muted leading-snug">
        {description}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
        {stage?.devinUrl ? (
          <ExternalAnchor href={stage.devinUrl}>
            <Eye aria-hidden="true" size={11} />
            <span>open session</span>
          </ExternalAnchor>
        ) : null}
        {stage?.prUrl ? (
          <ExternalAnchor href={stage.prUrl}>
            <GitPullRequest aria-hidden="true" size={11} />
            <span>view PR</span>
          </ExternalAnchor>
        ) : null}
        {stage?.branch ? (
          <span className="inline-flex items-center gap-1 font-mono text-fg-muted">
            <GitBranch aria-hidden="true" size={11} />
            <span title={stage.branch}>{truncateBranch(stage.branch)}</span>
          </span>
        ) : null}
        {stage?.lastError ? (
          <span className="truncate text-status-failed" title={stage.lastError}>
            {stage.lastError}
          </span>
        ) : null}
      </div>
    </div>
  );
};

const truncateBranch = (branch: string): string => {
  const MAX = 28;
  if (branch.length <= MAX) {
    return branch;
  }
  return `${branch.slice(0, MAX - 1)}…`;
};

// ---------------------------------------------------------------------------
// GitHub column
// ---------------------------------------------------------------------------

const GITHUB_PR_URL_RE =
  /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i;

interface ParsedPrUrl {
  number: string;
  owner: string;
  repo: string;
}

const parseGithubPrUrl = (url: string): ParsedPrUrl | null => {
  const match = GITHUB_PR_URL_RE.exec(url);
  if (!match) {
    return null;
  }
  const [, owner, repo, number] = match;
  if (!(owner && repo && number)) {
    return null;
  }
  return { number, owner, repo };
};

const resolveRepo = (data: CveFollowupDetailResponse): string | null => {
  if (data.followup.repoName) {
    return data.followup.repoName;
  }
  for (const stage of data.stages) {
    if (stage.prUrl) {
      const parsed = parseGithubPrUrl(stage.prUrl);
      if (parsed) {
        return `${parsed.owner}/${parsed.repo}`;
      }
    }
  }
  return null;
};

const GithubColumn = ({
  runId,
}: {
  runId: string | null;
}): React.JSX.Element => {
  const followup = useCveFollowupQuery(runId ?? "", {
    enabled: Boolean(runId),
  });
  const data = followup.data;
  const repo = data ? resolveRepo(data) : null;
  const stages = data?.stages ?? [];
  const repro = stages.find((stage) => stage.kind === "repro");
  const fix = stages.find((stage) => stage.kind === "fix");

  // GitHub column is "active" while either PR is open and pending review.
  const githubLive =
    (!!repro?.prUrl && repro.status !== "succeeded") ||
    (!!fix?.prUrl &&
      fix.status !== "succeeded" &&
      fix.status !== "succeeded_weak");

  return (
    <StageColumn
      active={githubLive}
      badge={
        repo ? (
          <span className="font-mono text-[11px] text-fg-muted">{repo}</span>
        ) : null
      }
      description="repo + reproduction PR + fix PR"
      icon={<GitMerge aria-hidden="true" size={16} />}
      step="03"
      subtitle="human in the loop"
      title="github"
    >
      {!runId && (
        <EmptyState
          hint="pick a cve follow-up to surface the repo and PRs."
          title="no follow-up selected"
        />
      )}
      {runId && followup.isLoading && <Spinner />}
      <ErrorState error={followup.error} title="follow-up unavailable" />
      {data ? (
        <div className="space-y-3">
          {repo ? (
            <RepoPanel repo={repo} updatedAt={data.followup.updatedAt} />
          ) : null}
          <PrCard kind="repro" stage={repro} title="reproduction PR" />
          <PrCard kind="fix" stage={fix} title="fix PR" />
        </div>
      ) : null}
    </StageColumn>
  );
};

const RepoPanel = ({
  repo,
  updatedAt,
}: {
  repo: string;
  updatedAt: string;
}): React.JSX.Element => (
  <a
    className="group block rounded-md border border-border bg-bg p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/60 hover:bg-bg-hover hover:shadow-[0_8px_24px_-12px_rgb(var(--accent)/0.5)]"
    href={`https://github.com/${repo}`}
    rel="noopener noreferrer"
    target="_blank"
  >
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0 space-y-0.5">
        <div className="font-medium text-[10px] text-fg-subtle uppercase tracking-[0.15em]">
          repository
        </div>
        <div className="truncate font-mono text-fg text-sm" title={repo}>
          {repo}
        </div>
      </div>
      <ChevronRight
        aria-hidden="true"
        className="text-fg-subtle transition-transform group-hover:translate-x-1 group-hover:text-accent"
        size={16}
      />
    </div>
    <div className="mt-2 text-[11px] text-fg-muted">
      last activity {formatRelativeTime(updatedAt)}
    </div>
  </a>
);

const prRowClass = (stage: CveFollowupStageRow | undefined): string => {
  if (!stage?.prUrl) {
    return "border border-border bg-bg";
  }
  if (stage.status === "succeeded" || stage.status === "succeeded_weak") {
    return "demo-completed-row bg-status-completed/5";
  }
  if (stage.status === "failed" || stage.status === "cancelled") {
    return "demo-failed-row bg-status-failed/5";
  }
  if (stage.status === "dispatched" || stage.status === "validating") {
    return "demo-active-row bg-status-running/5";
  }
  return "border border-border bg-bg";
};

const PrCard = ({
  kind,
  stage,
  title,
}: {
  kind: "fix" | "repro";
  stage: CveFollowupStageRow | undefined;
  title: string;
}): React.JSX.Element => {
  const parsed = stage?.prUrl ? parseGithubPrUrl(stage.prUrl) : null;
  const status = stage ? stagePhaseStatus(stage) : "idle";
  const active = status === "running";
  const description =
    kind === "repro"
      ? "engineer-facing PR with a working reproduction."
      : "patch PR that closes out the finding.";

  if (!stage?.prUrl) {
    return (
      <div className={cn("rounded-md p-3 transition-all", prRowClass(stage))}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-fg">
            <GitPullRequest
              aria-hidden="true"
              className={phaseTextClass(status)}
              size={16}
            />
            <span className="font-medium text-sm lowercase">{title}</span>
          </span>
          {stage ? (
            <Badge status={stage.status} />
          ) : (
            <span className="text-[11px] text-fg-subtle">awaiting devin</span>
          )}
        </div>
        <p className="text-[12px] text-fg-muted leading-snug">{description}</p>
      </div>
    );
  }

  return (
    <a
      className={cn(
        "group block rounded-md p-3 transition-all duration-300 hover:-translate-y-0.5 hover:bg-bg-hover hover:shadow-[0_8px_24px_-12px_rgb(var(--accent)/0.5)]",
        prRowClass(stage)
      )}
      href={stage.prUrl}
      rel="noopener noreferrer"
      target="_blank"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <GitPullRequest
            aria-hidden="true"
            className={phaseTextClass(status)}
            size={16}
          />
          <span
            className={cn(
              "font-medium text-sm lowercase",
              active ? "text-status-running" : "text-fg"
            )}
          >
            {title}
          </span>
          {active ? (
            <span className="rounded bg-status-running/15 px-1.5 py-0.5 font-medium text-[9px] text-status-running uppercase tracking-wider">
              open
            </span>
          ) : null}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Badge status={stage.status} />
          <ExternalLink
            aria-hidden="true"
            className="text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
            size={12}
          />
        </span>
      </div>
      <p className="mb-2 text-[12px] text-fg-muted leading-snug">
        {description}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]">
        {parsed ? (
          <span className="text-fg">
            <span className="text-fg-muted">{parsed.owner}/</span>
            {parsed.repo}
            <span className="text-fg-subtle">#</span>
            <span className="text-accent">{parsed.number}</span>
          </span>
        ) : (
          <span className="break-all text-fg">{stage.prUrl}</span>
        )}
        {stage.branch ? (
          <span className="inline-flex items-center gap-1 text-fg-muted">
            <GitBranch aria-hidden="true" size={10} />
            <span>{truncateBranch(stage.branch)}</span>
          </span>
        ) : null}
      </div>
    </a>
  );
};

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

const ExternalAnchor = ({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}): React.JSX.Element => (
  <a
    className="id-link inline-flex items-center gap-1 break-all"
    href={href}
    rel="noopener noreferrer"
    target="_blank"
  >
    {children}
  </a>
);
