import {
  type AuditAgentState,
  BaseAuditAgent,
} from "@codebreaker/control-plane/audits/agent-base";
import {
  COORDINATOR_TOOL_NAMES,
  createCoordinatorTools,
  DISPATCH_INVESTIGATOR_TOOL_NAME,
  DISPATCH_VALIDATOR_TOOL_NAME,
  FINALIZE_AUDIT_TOOL_NAME,
  LIST_PENDING_FINDINGS_TOOL_NAME,
} from "@codebreaker/control-plane/audits/coordinator-tools";
import type { TieredToolSet } from "@codebreaker/control-plane/tools/tiers";
import type { AuditConfig } from "@codebreaker/shared/schemas/audits";

export class AuditCoordinatorAgent extends BaseAuditAgent {
  initialState: AuditAgentState = { status: "pending" };

  protected getRoleTools(_audit: AuditConfig): TieredToolSet {
    const config = this.requireConfig();
    return createCoordinatorTools({
      baseSessionConfig: config,
      beginValidation: () => this.beginValidationPhase(),
      coordinatorSessionId: this.sessionId,
      env: this.env,
    });
  }

  protected getRoleActiveToolNames(_audit: AuditConfig): string[] {
    return COORDINATOR_TOOL_NAMES;
  }

  /**
   * Coordinator-only: dispatch + list-findings tools are treated as
   * submission tools so a coordinator that runs out of tokens mid-run can
   * still recover finding IDs (`list_pending_findings`), fire off the
   * remaining investigators/validators it had planned, and call
   * `finalize_audit`. These tools bypass `beforeToolCall` budget blocks
   * and are the only `activeTools` during the coordinator's finalizing
   * turn (see `BaseAuditAgent.finalTurnConfig`).
   */
  protected getRoleSubmissionToolNames(_audit: AuditConfig): string[] {
    return [
      DISPATCH_INVESTIGATOR_TOOL_NAME,
      DISPATCH_VALIDATOR_TOOL_NAME,
      LIST_PENDING_FINDINGS_TOOL_NAME,
      FINALIZE_AUDIT_TOOL_NAME,
    ];
  }
}
