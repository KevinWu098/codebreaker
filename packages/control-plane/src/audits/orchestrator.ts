import type { SaveMessagesResult } from "@cloudflare/think";
import { createGitTreeStore } from "@codebreaker/control-plane/artifacts/repository";
import {
  buildCoordinatorSystemPrompt,
  coordinatorInitialPrompt,
} from "@codebreaker/control-plane/audits/prompts";
import { DEFAULT_AUDIT_SHARDS } from "@codebreaker/control-plane/audits/shards";
import { AuditStore } from "@codebreaker/control-plane/db/audits";
import { SessionIndexStore } from "@codebreaker/control-plane/db/session-index";
import { withDORetry } from "@codebreaker/control-plane/do/retry";
import { ModalExecutor } from "@codebreaker/control-plane/sandbox/modal";
import type { Env } from "@codebreaker/control-plane/types";
import type {
  AuditConfig,
  AuditRow,
  CreateAuditRequest,
  ShardKind,
} from "@codebreaker/shared/schemas/audits";
import type { SessionConfig } from "@codebreaker/shared/schemas/session";
import { getAgentByName } from "agents";

const COORDINATOR_GRACE_SECONDS = 60;
const WATCHDOG_MAX_RUNNING_SECONDS = 7200;
const DEFAULT_WORKSPACE_ROOT = "/workspace";

interface CoordinatorAgentStub {
  init(sessionId: string, config: SessionConfig): Promise<unknown>;
  inspectState(): Promise<unknown>;
  requestFollowUp(content: string): Promise<SaveMessagesResult>;
  stopAndFinalize(reason?: string): Promise<SaveMessagesResult>;
}

export class AuditOrchestrator {
  private readonly audits: AuditStore;
  private readonly env: Env;
  private readonly sessions: SessionIndexStore;

  constructor(env: Env) {
    this.env = env;
    this.audits = new AuditStore(env.DB);
    this.sessions = new SessionIndexStore(env.DB);
  }

  async create(input: CreateAuditRequest): Promise<AuditRow> {
    const id = crypto.randomUUID();
    const audit = await this.audits.create({
      id,
      minConfidence: input.minConfidence,
      modelId: input.model.id,
      modelProvider: input.model.provider,
      ...(input.ref ? { ref: input.ref } : {}),
      repoUrl: input.repoUrl,
      sandboxProfile: input.sandboxProfile,
      ...(input.title ? { title: input.title } : {}),
    });

    if (input.autoStart) {
      await this.start(audit.id, input);
      const refreshed = await this.audits.get(audit.id);
      return refreshed ?? audit;
    }

    return audit;
  }

  async start(auditId: string, request: CreateAuditRequest): Promise<AuditRow> {
    await this.requireAudit(auditId);
    await this.audits.update({ id: auditId, status: "provisioning" });
    await this.audits.addEvent({
      auditId,
      kind: "provisioning_started",
      message: "Provisioning audit mirror repo",
    });

    try {
      const sessionConfig = await this.provision(auditId, request);
      const sessionId = `audit-${auditId}`;

      await this.sessions.upsert({
        agentRole: "audit_coordinator",
        config: sessionConfig,
        id: sessionId,
        status: "pending",
      });

      await this.audits.update({
        coordinatorSessionId: sessionId,
        id: auditId,
        startedAt: new Date().toISOString(),
        status: "running",
      });

      const agent = (await withDORetry(() =>
        getAgentByName(this.env.AUDIT_COORDINATOR, sessionId)
      )) as unknown as CoordinatorAgentStub;
      await withDORetry(() => agent.init(sessionId, sessionConfig));

      await this.sessions.setStatus({
        eventId: `init:${sessionId}`,
        id: sessionId,
        status: "idle",
      });

      await this.audits.addEvent({
        auditId,
        kind: "coordinator_started",
        message: "Coordinator agent initialized",
      });

      const audit = sessionConfig.audit;
      if (!audit) {
        throw new Error("internal: coordinator session config missing audit");
      }

      const turnTimeoutMs =
        (sessionConfig.timeoutSeconds + COORDINATOR_GRACE_SECONDS) * 1000;

      await withTimeout(
        agent.requestFollowUp(
          coordinatorInitialPrompt({
            auditId,
            ...(sessionConfig.repo?.defaultBranch
              ? { defaultBranch: sessionConfig.repo.defaultBranch }
              : {}),
            ...(audit.mirrorRepo
              ? { mirrorRepoFullName: audit.mirrorRepo.fullName }
              : {}),
            ...(audit.ref ? { ref: audit.ref } : {}),
            repoUrl: audit.repoUrl,
            workspacePath: audit.workspacePath,
          })
        ),
        turnTimeoutMs,
        `Coordinator turn did not complete within ${turnTimeoutMs / 1000}s`
      );

      await this.audits.addEvent({
        auditId,
        kind: "coordinator_completed",
        message: "Coordinator turn completed",
      });

      const refreshed = await this.audits.refreshCounts(auditId);

      if (refreshed.status === "running") {
        await this.audits.update({
          completedAt: new Date().toISOString(),
          id: auditId,
          status: "completed",
        });
        await this.audits.addEvent({
          auditId,
          kind: "completed",
          message: "Audit completed",
        });
      }

      await this.sessions.setStatus({
        completedAt: new Date().toISOString(),
        eventId: `coordinator-completed:${sessionId}`,
        id: sessionId,
        status: "completed",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const current = await this.audits.get(auditId);
      if (current?.status === "cancelled") {
        return current;
      }
      await this.audits.update({
        completedAt: new Date().toISOString(),
        error: message,
        id: auditId,
        status: "failed",
      });
      await this.audits.addEvent({
        auditId,
        details: { error: message },
        kind: "failed",
        message: `Audit failed: ${message}`,
      });
      const failedSessionId = `audit-${auditId}`;
      await this.sessions.setStatus({
        completedAt: new Date().toISOString(),
        eventId: `coordinator-failed:${failedSessionId}`,
        id: failedSessionId,
        status: "failed",
      });
    }

    return this.requireAudit(auditId);
  }

  async cancel(auditId: string): Promise<AuditRow> {
    const audit = await this.requireAudit(auditId);

    if (audit.coordinatorSessionId) {
      try {
        const sessionId = audit.coordinatorSessionId;
        const agent = (await withDORetry(() =>
          getAgentByName(this.env.AUDIT_COORDINATOR, sessionId)
        )) as unknown as CoordinatorAgentStub;
        await withDORetry(() => agent.stopAndFinalize("Audit cancelled"));
      } catch {
        // Best effort.
      }
    }

    await this.audits.update({
      completedAt: new Date().toISOString(),
      id: auditId,
      status: "cancelled",
    });
    await this.audits.addEvent({
      auditId,
      kind: "cancelled",
      message: "Audit cancelled",
    });
    if (audit.coordinatorSessionId) {
      await this.sessions.setStatus({
        completedAt: new Date().toISOString(),
        eventId: `coordinator-cancelled:${audit.coordinatorSessionId}`,
        id: audit.coordinatorSessionId,
        status: "archived",
      });
    }

    return this.requireAudit(auditId);
  }

  async cleanup(auditId: string): Promise<AuditRow> {
    const audit = await this.requireAudit(auditId);

    await this.audits.update({ id: auditId, status: "cleaning_up" });

    const sessionId = audit.coordinatorSessionId;
    if (sessionId) {
      try {
        await ModalExecutor.fromEnv(this.env).terminate(sessionId);
      } catch {
        // ignore termination errors
      }
    }

    await this.audits.update({
      cleanupCompletedAt: new Date().toISOString(),
      id: auditId,
      status: "cleaned",
    });
    await this.audits.addEvent({
      auditId,
      kind: "cleanup_completed",
      message: "Audit cleanup completed",
    });

    return this.requireAudit(auditId);
  }

  async watchdogScan(): Promise<{ finalized: string[] }> {
    const cutoffMs = Date.now() - WATCHDOG_MAX_RUNNING_SECONDS * 1000;
    const cutoffIso = new Date(cutoffMs).toISOString();
    const stuckIds = await this.audits.listRunningIds();
    const finalized: string[] = [];

    for (const id of stuckIds) {
      const audit = await this.audits.get(id);
      if (!audit || audit.createdAt > cutoffIso) {
        continue;
      }
      const elapsedSeconds = Math.round(
        (Date.now() - new Date(audit.createdAt).getTime()) / 1000
      );
      const message = `Watchdog timeout: audit was running for ${elapsedSeconds}s (max ${WATCHDOG_MAX_RUNNING_SECONDS}s)`;
      await this.audits.update({
        completedAt: new Date().toISOString(),
        error: message,
        id,
        status: "failed",
      });
      await this.audits.addEvent({
        auditId: id,
        kind: "failed",
        message,
      });
      if (audit.coordinatorSessionId) {
        await this.sessions.setStatus({
          completedAt: new Date().toISOString(),
          eventId: `watchdog-failed:${audit.coordinatorSessionId}`,
          id: audit.coordinatorSessionId,
          status: "failed",
        });
      }
      finalized.push(id);
    }

    return { finalized };
  }

  private async provision(
    auditId: string,
    request: CreateAuditRequest
  ): Promise<SessionConfig> {
    const store = createGitTreeStore(this.env);
    const targetRepo = await store.ensureStableTarget({
      target: {
        benchmarkId: `audit-${auditId}`,
        defaultBranch: "main",
        sourceUrl: request.repoUrl,
        targetRepoName: `audit-${auditId}`,
      },
    });

    await this.audits.update({
      id: auditId,
      mirrorRepoFullName: targetRepo.fullName,
    });
    await this.audits.addEvent({
      auditId,
      details: { mirrorRepo: targetRepo.fullName },
      kind: "provisioning_completed",
      message: "Audit mirror repo ready",
    });

    const ref = request.ref ?? targetRepo.defaultBranch;
    const sessionId = `audit-${auditId}`;
    const workspacePath = `${DEFAULT_WORKSPACE_ROOT}/${targetRepo.name}`;

    await this.audits.addEvent({
      auditId,
      kind: "checkout_started",
      message: "Checking out audit repository",
    });

    const credential = await store.mintCredential({
      repo: targetRepo,
      scope: "read",
    });
    await ModalExecutor.fromEnv(this.env).checkoutGitRepo({
      branch: targetRepo.defaultBranch,
      credential,
      path: workspacePath,
      ref,
      remoteUrl: targetRepo.cloneUrl,
      sessionId,
      ...(request.sandboxProfile ? { profile: request.sandboxProfile } : {}),
    });

    await this.audits.addEvent({
      auditId,
      details: { ref, workspacePath },
      kind: "checkout_completed",
      message: "Audit repository checked out",
    });

    const audit: AuditConfig = {
      auditId,
      maxConcurrentInvestigators: request.maxConcurrentInvestigators,
      minConfidence: request.minConfidence,
      mirrorRepo: {
        cloneUrl: targetRepo.cloneUrl,
        defaultBranch: targetRepo.defaultBranch,
        fullName: targetRepo.fullName,
        name: targetRepo.name,
      },
      ref,
      repoUrl: request.repoUrl,
      role: "coordinator",
      sandboxSessionId: sessionId,
      workspacePath,
    };

    const shards: ShardKind[] = request.shards ?? DEFAULT_AUDIT_SHARDS;

    const baseConfig: SessionConfig = {
      audit,
      budgets: {
        maxInputTokens: request.budgets?.maxInputTokens ?? null,
        maxOutputTokens: request.budgets?.maxOutputTokens ?? null,
        maxToolCalls: request.budgets?.maxToolCalls ?? null,
        maxTotalTokens: request.budgets?.maxTotalTokens ?? null,
      },
      compaction: {
        enabled: true,
        maxContextTokens: 250_000,
        preserveRecentMessages: 12,
        summarizeAtTokens: 225_000,
      },
      extensionPolicy: "sandbox",
      maxSteps: 60,
      maxTurns: 200,
      model: {
        id: request.model.id,
        provider: request.model.provider,
        ...(request.model.reasoningEffort
          ? { reasoningEffort: request.model.reasoningEffort }
          : {}),
      },
      repo: {
        defaultBranch: targetRepo.defaultBranch,
        name: targetRepo.name,
        provider: targetRepo.provider === "github" ? "github" : "github",
        ref,
        url: targetRepo.cloneUrl,
      },
      sandbox: {
        profile: request.sandboxProfile,
        provider: "modal",
      },
      systemPrompt: buildCoordinatorSystemPrompt(
        {
          auditId,
          defaultBranch: targetRepo.defaultBranch,
          mirrorRepoFullName: targetRepo.fullName,
          ref,
          repoUrl: request.repoUrl,
          workspacePath,
        },
        shards
      ),
      timeoutSeconds: request.timeoutSeconds,
      ...(request.title ? { title: request.title } : {}),
    };

    return baseConfig;
  }

  private async requireAudit(auditId: string): Promise<AuditRow> {
    const audit = await this.audits.get(auditId);
    if (!audit) {
      throw new Error(`Audit ${auditId} not found`);
    }
    return audit;
  }
}

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
