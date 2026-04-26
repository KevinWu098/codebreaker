import type {
  CveFollowupDetailResponse,
  CveFollowupStageRow,
} from "@codebreaker/benchmark-runner/schemas";
import type {
  AuditDetailResponse,
  AuditFindingRow,
  AuditRow,
  AuditShardRow,
} from "@codebreaker/shared/schemas/audits";
import {
  Bot,
  CircleDashed,
  ExternalLink,
  Eye,
  GitBranch,
  GitMerge,
  GitPullRequest,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Badge } from "@/components/badge";
import { Card } from "@/components/card";
import { DevinWord } from "@/components/devin-word";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Spinner } from "@/components/spinner";
import {
  useAuditQuery,
  useAuditsQuery,
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
    <div className="space-y-4">
      <PageHeader
        description={
          <span className="lowercase">
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
  const audits = useAuditsQuery({ limit: 50, offset: 0 });
  const followups = useCveFollowupsListQuery();

  return (
    <div className="grid gap-3 rounded border border-border bg-bg-raised p-3 md:grid-cols-2">
      <label className="space-y-1 text-xs">
        <span className="field-label inline-flex items-center gap-1">
          <ShieldAlert aria-hidden="true" size={11} />
          <span>audit run</span>
        </span>
        <select
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
      </label>
      <label className="space-y-1 text-xs">
        <span className="field-label inline-flex items-center gap-1">
          <GitMerge aria-hidden="true" size={11} />
          <span>cve follow-up</span>
        </span>
        <select
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
      </label>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Audit phase derivation
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
  const auditComplete = audit?.status === "completed";
  const phaseSummary = auditComplete ? "audit complete" : "—";

  return (
    <Card
      className="flex min-w-0 flex-col"
      title={
        <span className="inline-flex items-center gap-1.5">
          <ShieldAlert aria-hidden="true" size={12} />
          <span>identification · audit loop</span>
        </span>
      }
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
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <div
                  className="truncate font-medium text-fg"
                  title={audit.repoUrl}
                >
                  {audit.title ?? audit.repoUrl}
                </div>
                <div
                  className="truncate font-mono text-[11px] text-fg-muted"
                  title={audit.id}
                >
                  {audit.id}
                </div>
              </div>
              <Badge status={audit.status} />
            </div>
            <SegmentedProgress overall={overall} phases={phases} />
            <div className="flex items-center justify-between text-[11px] text-fg-muted">
              <span>
                {activePhase ? (
                  <span className="inline-flex items-center gap-1 text-fg">
                    <Sparkles
                      aria-hidden="true"
                      className="animate-pulse"
                      size={10}
                    />
                    <span>current phase: {activePhase.label}</span>
                  </span>
                ) : (
                  phaseSummary
                )}
              </span>
              <span className="tabular-nums">
                {Math.round(overall * PERCENT)}%
              </span>
            </div>
          </div>

          <div className="space-y-2">
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
    </Card>
  );
};

const SegmentedProgress = ({
  overall,
  phases,
}: {
  overall: number;
  phases: AuditPhase[];
}): React.JSX.Element => (
  <div
    aria-label="audit progress"
    aria-valuemax={100}
    aria-valuemin={0}
    aria-valuenow={Math.round(overall * PERCENT)}
    className="flex h-2 overflow-hidden rounded bg-bg-overlay"
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
          <div className="pointer-events-none absolute inset-0 animate-pulse bg-status-running/20" />
        ) : null}
      </div>
    ))}
  </div>
);

const phaseIconClass = (status: AuditPhaseStatus): string => {
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

const PhaseRow = ({ phase }: { phase: AuditPhase }): React.JSX.Element => (
  <div className="rounded border border-border bg-bg p-2 text-xs">
    <div className="mb-1 flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-fg">
        <CircleDashed
          aria-hidden="true"
          className={cn(
            phaseIconClass(phase.status),
            phase.status === "running" && "animate-spin"
          )}
          size={11}
        />
        <span className="font-medium">{phase.label}</span>
      </span>
      <span className="text-[11px] text-fg-muted tabular-nums">
        {Math.round(Math.min(1, Math.max(0, phase.progress)) * PERCENT)}%
      </span>
    </div>
    <p className="text-fg-muted">{phase.description}</p>
  </div>
);

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
    <div className="rounded border border-border bg-bg p-2 text-xs">
      <div className="field-label">tally</div>
      <div className="grid grid-cols-2 gap-y-1 text-[11px] text-fg-muted sm:grid-cols-4">
        <div>
          <span className="text-fg tabular-nums">{shards.length}</span> shards
        </div>
        <div>
          <span className="text-status-completed tabular-nums">
            {validated}
          </span>{" "}
          validated
        </div>
        <div>
          <span className="text-fg tabular-nums">{candidate}</span> candidate
        </div>
        <div>
          <span className="text-fg-muted tabular-nums">{dismissed}</span>{" "}
          dismissed
        </div>
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
  const followupComplete = data?.followup.status === "completed";
  const stageSummary = followupComplete ? "fix shipped" : "—";

  return (
    <Card
      className="flex min-w-0 flex-col"
      title={
        <span className="inline-flex items-center gap-1.5">
          <Bot aria-hidden="true" size={12} />
          <span>
            validation &amp; fix · <DevinWord />
          </span>
        </span>
      }
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
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <div
                  className="truncate font-medium text-fg"
                  title={data.followup.id}
                >
                  {data.followup.repoName ?? data.followup.taskId}
                </div>
                <div
                  className="truncate font-mono text-[11px] text-fg-muted"
                  title={data.followup.ghsaId}
                >
                  {data.followup.ghsaId}
                </div>
              </div>
              <Badge status={data.followup.status} />
            </div>
            <DevinTwoStepProgress fix={fix} overall={overall} repro={repro} />
            <div className="flex items-center justify-between text-[11px] text-fg-muted">
              <span>
                {activeStage ? (
                  <span className="inline-flex items-center gap-1 text-fg">
                    <Sparkles
                      aria-hidden="true"
                      className="animate-pulse"
                      size={10}
                    />
                    <span>current phase: {activeStage}</span>
                  </span>
                ) : (
                  stageSummary
                )}
              </span>
              <span className="tabular-nums">
                {Math.round(overall * PERCENT)}%
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <DevinStageBox kind="repro" stage={repro} title="reproduction" />
            <DevinStageBox kind="fix" stage={fix} title="fix" />
          </div>
        </div>
      ) : null}
    </Card>
  );
};

const DevinTwoStepProgress = ({
  fix,
  overall,
  repro,
}: {
  fix: CveFollowupStageRow | undefined;
  overall: number;
  repro: CveFollowupStageRow | undefined;
}): React.JSX.Element => (
  <div
    aria-label="devin progress"
    aria-valuemax={100}
    aria-valuemin={0}
    aria-valuenow={Math.round(overall * PERCENT)}
    className="flex h-2 overflow-hidden rounded bg-bg-overlay"
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
            <div className="pointer-events-none absolute inset-0 animate-pulse bg-status-running/20" />
          ) : null}
        </div>
      );
    })}
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
  const description =
    kind === "repro"
      ? "devin opens a sandbox, reproduces the bug, files a repro PR."
      : "devin patches the code, validates the fix, files a fix PR.";

  return (
    <div
      className={cn(
        "rounded border border-border bg-bg p-2 text-xs transition-colors",
        status === "running" && "border-status-running/50",
        status === "completed" && "border-status-completed/40",
        status === "failed" && "border-status-failed/40"
      )}
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-medium text-fg">
          <DevinWord />
          <span className="text-fg-muted">·</span>
          <span>{title}</span>
        </span>
        {stage ? (
          <Badge status={stage.status} />
        ) : (
          <span className="text-[11px] text-fg-subtle">not yet dispatched</span>
        )}
      </div>
      <p className="mb-2 text-fg-muted">{description}</p>
      <div className="mb-2 h-1 overflow-hidden rounded bg-bg-overlay">
        <div
          className={cn(
            "h-full transition-all duration-700 ease-out",
            phaseFillClass(status)
          )}
          style={{ width: `${progress * PERCENT}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-fg-muted">
        {stage?.devinUrl ? (
          <ExternalAnchor href={stage.devinUrl}>
            <Eye aria-hidden="true" size={10} />
            <span>open session</span>
          </ExternalAnchor>
        ) : null}
        {stage?.prUrl ? (
          <ExternalAnchor href={stage.prUrl}>
            <GitPullRequest aria-hidden="true" size={10} />
            <span>view PR</span>
          </ExternalAnchor>
        ) : null}
        {stage?.branch ? (
          <span className="inline-flex items-center gap-1 font-mono">
            <GitBranch aria-hidden="true" size={10} />
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

  return (
    <Card
      className="flex min-w-0 flex-col"
      title={
        <span className="inline-flex items-center gap-1.5">
          <GitMerge aria-hidden="true" size={12} />
          <span>human in the loop · github</span>
        </span>
      }
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
    </Card>
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
    className="group block rounded border border-border bg-bg p-3 transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-[0_4px_16px_-8px_rgb(var(--accent)/0.4)]"
    href={`https://github.com/${repo}`}
    rel="noopener noreferrer"
    target="_blank"
  >
    <div className="flex items-center justify-between gap-2 text-xs">
      <div className="min-w-0">
        <div className="field-label">repository</div>
        <div className="truncate font-mono text-fg" title={repo}>
          {repo}
        </div>
      </div>
      <div className="text-fg-subtle transition-transform group-hover:translate-x-0.5">
        <ExternalLink aria-hidden="true" size={14} />
      </div>
    </div>
    <div className="mt-2 text-[11px] text-fg-muted">
      last activity {formatRelativeTime(updatedAt)}
    </div>
  </a>
);

const prAccentClass = (
  stage: CveFollowupStageRow | undefined
): { border: string; dot: string } => {
  if (!stage?.prUrl) {
    return { border: "border-border", dot: "bg-fg-subtle" };
  }
  if (stage.status === "succeeded" || stage.status === "succeeded_weak") {
    return {
      border: "border-status-completed/40",
      dot: "bg-status-completed",
    };
  }
  if (stage.status === "failed" || stage.status === "cancelled") {
    return { border: "border-status-failed/40", dot: "bg-status-failed" };
  }
  if (stage.status === "dispatched" || stage.status === "validating") {
    return { border: "border-status-running/40", dot: "bg-status-running" };
  }
  return { border: "border-border", dot: "bg-status-pending" };
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
  const accent = prAccentClass(stage);
  const parsed = stage?.prUrl ? parseGithubPrUrl(stage.prUrl) : null;
  const description =
    kind === "repro"
      ? "engineer-facing PR with a working reproduction."
      : "patch PR that closes out the finding.";

  if (!stage?.prUrl) {
    return (
      <div
        className={cn(
          "rounded border bg-bg p-2 text-xs transition-colors",
          accent.border
        )}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-fg">
            <span className={cn("status-dot", accent.dot)} />
            <span className="font-medium">{title}</span>
          </span>
          {stage ? (
            <Badge status={stage.status} />
          ) : (
            <span className="text-[11px] text-fg-subtle">awaiting devin</span>
          )}
        </div>
        <p className="text-fg-muted">{description}</p>
      </div>
    );
  }

  return (
    <a
      className={cn(
        "group block rounded border bg-bg p-2 text-xs transition-all hover:-translate-y-0.5 hover:border-accent/70 hover:bg-bg-hover hover:shadow-[0_4px_16px_-8px_rgb(var(--accent)/0.5)]",
        accent.border
      )}
      href={stage.prUrl}
      rel="noopener noreferrer"
      target="_blank"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-fg">
          <span
            className={cn(
              "status-dot",
              accent.dot,
              (stage.status === "dispatched" ||
                stage.status === "validating") &&
                "animate-pulse"
            )}
          />
          <GitPullRequest aria-hidden="true" size={11} />
          <span className="font-medium">{title}</span>
        </span>
        <span className="inline-flex items-center gap-1 text-fg-muted">
          <Badge status={stage.status} />
          <ExternalLink
            aria-hidden="true"
            className="text-fg-subtle transition-transform group-hover:translate-x-0.5"
            size={11}
          />
        </span>
      </div>
      <p className="mb-1 text-fg-muted">{description}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-fg">
        {parsed ? (
          <span>
            {parsed.owner}/{parsed.repo}
            <span className="text-fg-subtle">#</span>
            {parsed.number}
          </span>
        ) : (
          <span className="break-all">{stage.prUrl}</span>
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
