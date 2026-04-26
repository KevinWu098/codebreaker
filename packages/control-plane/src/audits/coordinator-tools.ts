import { AuditStore } from "@codebreaker/control-plane/db/audits";
import { SessionIndexStore } from "@codebreaker/control-plane/db/session-index";
import { withDORetry } from "@codebreaker/control-plane/do/retry";
import {
  type TieredToolSet,
  ToolTier,
} from "@codebreaker/control-plane/tools/tiers";
import type { Env } from "@codebreaker/control-plane/types";
import type {
  AuditConfig,
  ShardKind,
} from "@codebreaker/shared/schemas/audits";
import { ShardKindSchema } from "@codebreaker/shared/schemas/audits";
import type { SessionConfig } from "@codebreaker/shared/schemas/session";
import { getAgentByName } from "agents";
import { tool } from "ai";
import { z } from "zod";

export const PLAN_SHARDS_TOOL_NAME = "plan_shards" as const;
export const DISPATCH_INVESTIGATOR_TOOL_NAME = "dispatch_investigator" as const;
export const DISPATCH_VALIDATOR_TOOL_NAME = "dispatch_validator" as const;
export const FINALIZE_AUDIT_TOOL_NAME = "finalize_audit" as const;

const INVESTIGATOR_DEFAULT_TIMEOUT_SECONDS = 600;
const VALIDATOR_DEFAULT_TIMEOUT_SECONDS = 300;
const INVESTIGATOR_GRACE_SECONDS = 30;

const PlanShardsInputSchema = z
  .object({
    rationale: z.string().min(1).max(2000).optional(),
    shards: z.array(ShardKindSchema).min(1).max(15),
  })
  .strict();

const DispatchInvestigatorInputSchema = z
  .object({
    briefing: z.string().min(20).max(4000),
    shard: ShardKindSchema,
    timeoutSeconds: z.number().int().positive().max(1800).optional(),
  })
  .strict();

const DispatchValidatorInputSchema = z
  .object({
    findingId: z.string().min(1),
    timeoutSeconds: z.number().int().positive().max(900).optional(),
  })
  .strict();

const FinalizeAuditInputSchema = z
  .object({
    summary: z.string().min(1).max(8000),
  })
  .strict();

export interface CoordinatorToolContext {
  baseSessionConfig: SessionConfig;
  coordinatorSessionId: string;
  env: Env;
}

const buildChildSessionConfig = (
  parent: SessionConfig,
  overrides: Partial<SessionConfig["audit"]> & {
    repoUrl: string;
    role: NonNullable<SessionConfig["audit"]>["role"];
    workspacePath: string;
    auditId: string;
    maxConcurrentInvestigators: number;
    minConfidence: number;
  },
  budget: {
    maxSteps?: number;
    maxTurns?: number;
    timeoutSeconds: number;
  }
): SessionConfig => {
  const inheritedSandboxId =
    overrides.sandboxSessionId ?? parent.audit?.sandboxSessionId;
  const audit: NonNullable<SessionConfig["audit"]> = {
    auditId: overrides.auditId,
    maxConcurrentInvestigators: overrides.maxConcurrentInvestigators,
    minConfidence: overrides.minConfidence,
    repoUrl: overrides.repoUrl,
    role: overrides.role,
    workspacePath: overrides.workspacePath,
    ...(inheritedSandboxId ? { sandboxSessionId: inheritedSandboxId } : {}),
    ...(overrides.findingId ? { findingId: overrides.findingId } : {}),
    ...(overrides.mirrorRepo ? { mirrorRepo: overrides.mirrorRepo } : {}),
    ...(overrides.ref ? { ref: overrides.ref } : {}),
    ...(overrides.shardId ? { shardId: overrides.shardId } : {}),
    ...(overrides.shardKind ? { shardKind: overrides.shardKind } : {}),
  };

  return {
    ...parent,
    audit,
    maxSteps: budget.maxSteps ?? parent.maxSteps,
    maxTurns: budget.maxTurns ?? parent.maxTurns,
    timeoutSeconds: budget.timeoutSeconds,
  };
};

type DispatchInvestigatorInput = z.infer<
  typeof DispatchInvestigatorInputSchema
>;
type DispatchValidatorInput = z.infer<typeof DispatchValidatorInputSchema>;

const dispatchInvestigator = async (
  context: CoordinatorToolContext,
  audit: AuditConfig,
  auditId: string,
  { briefing, shard, timeoutSeconds }: DispatchInvestigatorInput
) => {
  const store = new AuditStore(context.env.DB);
  const shardRow =
    (await store.getShardByKind(auditId, shard)) ??
    (await store.createShard({
      auditId,
      id: crypto.randomUUID(),
      kind: shard,
    }));

  const sessionId = `audit-${auditId}-inv-${shard}`;
  const childConfig = buildChildSessionConfig(
    context.baseSessionConfig,
    {
      auditId,
      maxConcurrentInvestigators: audit.maxConcurrentInvestigators,
      minConfidence: audit.minConfidence,
      repoUrl: audit.repoUrl,
      role: "investigator",
      sandboxSessionId: context.coordinatorSessionId,
      shardId: shardRow.id,
      shardKind: shard,
      workspacePath: audit.workspacePath,
      ...(audit.mirrorRepo ? { mirrorRepo: audit.mirrorRepo } : {}),
      ...(audit.ref ? { ref: audit.ref } : {}),
    },
    {
      timeoutSeconds: timeoutSeconds ?? INVESTIGATOR_DEFAULT_TIMEOUT_SECONDS,
    }
  );

  await store.updateShard({
    id: shardRow.id,
    investigatorSessionId: sessionId,
    startedAt: new Date().toISOString(),
    status: "investigating",
  });
  await store.addEvent({
    auditId,
    details: { sessionId, shard, shardId: shardRow.id },
    kind: "shard_started",
    message: `Investigator started for shard ${shard}`,
  });

  const beforeCount = await store.countFindings({
    auditId,
    shard,
  });

  const { buildInvestigatorSystemPrompt, investigatorInitialPrompt } =
    await import("@codebreaker/control-plane/audits/prompts");

  const promptInput = {
    briefing,
    env: {
      auditId,
      repoUrl: audit.repoUrl,
      workspacePath: audit.workspacePath,
      ...(audit.mirrorRepo
        ? { mirrorRepoFullName: audit.mirrorRepo.fullName }
        : {}),
      ...(audit.ref ? { ref: audit.ref } : {}),
    },
    shard,
  };

  const childWithSystem: SessionConfig = {
    ...childConfig,
    systemPrompt: buildInvestigatorSystemPrompt(promptInput),
  };

  const turnTimeoutMs =
    (childWithSystem.timeoutSeconds + INVESTIGATOR_GRACE_SECONDS) * 1000;

  const sessions = new SessionIndexStore(context.env.DB);
  await sessions.upsert({
    agentRole: "audit_investigator",
    config: childWithSystem,
    id: sessionId,
    status: "pending",
  });

  let turnError: string | undefined;
  try {
    const child = await withDORetry(() =>
      getAgentByName(context.env.AUDIT_INVESTIGATOR, sessionId)
    );
    await withDORetry(() => child.init(sessionId, childWithSystem));
    await sessions.setStatus({
      eventId: `init:${sessionId}`,
      id: sessionId,
      status: "idle",
    });
    await withTimeout(
      child.requestFollowUp(investigatorInitialPrompt(promptInput)),
      turnTimeoutMs,
      `Investigator ${shard} did not finish in ${turnTimeoutMs / 1000}s`
    );
  } catch (error) {
    turnError = error instanceof Error ? error.message : String(error);
  }

  await sessions.setStatus({
    completedAt: new Date().toISOString(),
    eventId: `investigator-${turnError ? "failed" : "completed"}:${sessionId}`,
    id: sessionId,
    status: turnError ? "failed" : "completed",
  });

  const afterCount = await store.countFindings({
    auditId,
    shard,
  });

  if (turnError) {
    await store.updateShard({
      completedAt: new Date().toISOString(),
      error: turnError,
      id: shardRow.id,
      status: "failed",
    });
    await store.addEvent({
      auditId,
      details: { error: turnError, shard, shardId: shardRow.id },
      kind: "shard_failed",
      message: `Investigator failed for shard ${shard}: ${turnError}`,
    });
  } else {
    await store.updateShard({
      completedAt: new Date().toISOString(),
      id: shardRow.id,
      status: "completed",
    });
    await store.addEvent({
      auditId,
      details: {
        candidates: afterCount - beforeCount,
        shard,
        shardId: shardRow.id,
      },
      kind: "shard_completed",
      message: `Investigator completed shard ${shard} with ${afterCount - beforeCount} candidate(s)`,
    });
  }

  await store.refreshCounts(auditId);

  return {
    error: turnError ?? null,
    newCandidates: Math.max(0, afterCount - beforeCount),
    sessionId,
    shard,
    shardId: shardRow.id,
  };
};

const dispatchValidator = async (
  context: CoordinatorToolContext,
  audit: AuditConfig,
  auditId: string,
  { findingId, timeoutSeconds }: DispatchValidatorInput
) => {
  const store = new AuditStore(context.env.DB);
  const finding = await store.getFinding(findingId);
  if (!finding || finding.auditId !== auditId) {
    return {
      error: `Finding ${findingId} not found in this audit`,
      ok: false as const,
    };
  }
  if (finding.status !== "candidate") {
    return {
      error: `Finding ${findingId} is already ${finding.status}`,
      ok: false as const,
      status: finding.status,
    };
  }

  const sessionId = `audit-${auditId}-val-${findingId}`;
  const childConfig = buildChildSessionConfig(
    context.baseSessionConfig,
    {
      auditId,
      findingId,
      maxConcurrentInvestigators: audit.maxConcurrentInvestigators,
      minConfidence: audit.minConfidence,
      repoUrl: audit.repoUrl,
      role: "validator",
      sandboxSessionId: context.coordinatorSessionId,
      workspacePath: audit.workspacePath,
      ...(audit.mirrorRepo ? { mirrorRepo: audit.mirrorRepo } : {}),
      ...(audit.ref ? { ref: audit.ref } : {}),
    },
    {
      timeoutSeconds: timeoutSeconds ?? VALIDATOR_DEFAULT_TIMEOUT_SECONDS,
    }
  );

  const { buildValidatorSystemPrompt, validatorInitialPrompt } = await import(
    "@codebreaker/control-plane/audits/prompts"
  );
  const promptInput = {
    env: {
      auditId,
      repoUrl: audit.repoUrl,
      workspacePath: audit.workspacePath,
      ...(audit.mirrorRepo
        ? { mirrorRepoFullName: audit.mirrorRepo.fullName }
        : {}),
      ...(audit.ref ? { ref: audit.ref } : {}),
    },
    finding,
  };
  const withSystem: SessionConfig = {
    ...childConfig,
    systemPrompt: buildValidatorSystemPrompt(promptInput),
  };

  await store.addEvent({
    auditId,
    details: { findingId, sessionId },
    kind: "validator_started",
    message: `Validator started for finding ${findingId}`,
  });

  const turnTimeoutMs =
    (withSystem.timeoutSeconds + INVESTIGATOR_GRACE_SECONDS) * 1000;

  const sessions = new SessionIndexStore(context.env.DB);
  await sessions.upsert({
    agentRole: "audit_validator",
    config: withSystem,
    id: sessionId,
    status: "pending",
  });

  let turnError: string | undefined;
  try {
    const child = await withDORetry(() =>
      getAgentByName(context.env.AUDIT_VALIDATOR, sessionId)
    );
    await withDORetry(() => child.init(sessionId, withSystem));
    await sessions.setStatus({
      eventId: `init:${sessionId}`,
      id: sessionId,
      status: "idle",
    });
    await withTimeout(
      child.requestFollowUp(validatorInitialPrompt(promptInput)),
      turnTimeoutMs,
      `Validator for ${findingId} did not finish in ${turnTimeoutMs / 1000}s`
    );
  } catch (error) {
    turnError = error instanceof Error ? error.message : String(error);
  }

  await sessions.setStatus({
    completedAt: new Date().toISOString(),
    eventId: `validator-${turnError ? "failed" : "completed"}:${sessionId}`,
    id: sessionId,
    status: turnError ? "failed" : "completed",
  });

  if (turnError) {
    await store.addEvent({
      auditId,
      details: { error: turnError, findingId, sessionId },
      kind: "validator_failed",
      message: `Validator failed for finding ${findingId}: ${turnError}`,
    });
  } else {
    await store.addEvent({
      auditId,
      details: { findingId, sessionId },
      kind: "validator_completed",
      message: `Validator completed for finding ${findingId}`,
    });
  }

  const updated = await store.getFinding(findingId);
  await store.refreshCounts(auditId);
  return {
    error: turnError ?? null,
    findingId,
    sessionId,
    status: updated?.status ?? finding.status,
  };
};

export const createCoordinatorTools = (
  context: CoordinatorToolContext
): TieredToolSet => {
  const audit = context.baseSessionConfig.audit;
  if (!audit) {
    throw new Error("Coordinator tools require config.audit");
  }

  const auditId = audit.auditId;

  return {
    tiers: {
      [PLAN_SHARDS_TOOL_NAME]: ToolTier.Read,
      [DISPATCH_INVESTIGATOR_TOOL_NAME]: ToolTier.Read,
      [DISPATCH_VALIDATOR_TOOL_NAME]: ToolTier.Read,
      [FINALIZE_AUDIT_TOOL_NAME]: ToolTier.Read,
    },
    tools: {
      [PLAN_SHARDS_TOOL_NAME]: tool({
        description:
          "Lock in the active shards for this audit. Pass an array of shard kinds (subset of the available shards). Persists planned shards to D1. Call this exactly once after orientation. Optional rationale is recorded as an event.",
        inputSchema: PlanShardsInputSchema,
        execute: async ({ rationale, shards }) => {
          const store = new AuditStore(context.env.DB);
          const created = [] as Array<{ id: string; kind: ShardKind }>;
          for (const kind of shards) {
            const shard = await store.createShard({
              auditId,
              id: crypto.randomUUID(),
              kind,
            });
            created.push({ id: shard.id, kind: shard.kind });
          }
          await store.addEvent({
            auditId,
            details: { rationale, shards },
            kind: "shard_planned",
            message: `Coordinator planned ${shards.length} shard(s)`,
          });
          return {
            ok: true,
            shards: created,
          };
        },
      }),
      [DISPATCH_INVESTIGATOR_TOOL_NAME]: tool({
        description:
          "Spawn an Investigator subagent for one shard. Provide a concrete briefing (hot-spot directories, vulnerability families to prioritize, project conventions). Blocks until the investigator turn finishes. On return, candidate findings are already persisted to D1; this tool returns the count of new candidates and a short summary.",
        inputSchema: DispatchInvestigatorInputSchema,
        execute: async (input) =>
          dispatchInvestigator(context, audit, auditId, input),
      }),
      [DISPATCH_VALIDATOR_TOOL_NAME]: tool({
        description:
          "Spawn a Validator subagent for one candidate finding (by id). Blocks until the validator turn finishes. On return, the finding's status will be 'validated' or 'dismissed'.",
        inputSchema: DispatchValidatorInputSchema,
        execute: async (input) =>
          dispatchValidator(context, audit, auditId, input),
      }),
      [FINALIZE_AUDIT_TOOL_NAME]: tool({
        description:
          "Mark the audit as completed and record an executive summary as an event. Call this only after all dispatches are done.",
        inputSchema: FinalizeAuditInputSchema,
        execute: async ({ summary }) => {
          const store = new AuditStore(context.env.DB);
          const refreshed = await store.refreshCounts(auditId);
          await store.update({
            completedAt: new Date().toISOString(),
            id: auditId,
            status: "completed",
          });
          await store.addEvent({
            auditId,
            details: {
              highConfidenceCount: refreshed.highConfidenceCount,
              summary,
              totalCandidates: refreshed.totalCandidates,
              validatedCount: refreshed.validatedCount,
            },
            kind: "completed",
            message: `Audit finalized: ${summary.slice(0, 200)}`,
          });
          return {
            highConfidenceCount: refreshed.highConfidenceCount,
            ok: true as const,
            totalCandidates: refreshed.totalCandidates,
            validatedCount: refreshed.validatedCount,
          };
        },
      }),
    },
  };
};

export const COORDINATOR_TOOL_NAMES = [
  PLAN_SHARDS_TOOL_NAME,
  DISPATCH_INVESTIGATOR_TOOL_NAME,
  DISPATCH_VALIDATOR_TOOL_NAME,
  FINALIZE_AUDIT_TOOL_NAME,
];

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
};
