import {
  type AuditAgentState,
  BaseAuditAgent,
} from "@codebreaker/control-plane/audits/agent-base";
import {
  createSubmitAuditFindingTool,
  SUBMIT_AUDIT_FINDING_TOOL_NAME,
} from "@codebreaker/control-plane/tools/audit-finding";
import type { TieredToolSet } from "@codebreaker/control-plane/tools/tiers";
import type { AuditConfig } from "@codebreaker/shared/schemas/audits";

export class AuditInvestigatorAgent extends BaseAuditAgent {
  initialState: AuditAgentState = { status: "pending" };

  protected getRoleTools(audit: AuditConfig): TieredToolSet {
    return createSubmitAuditFindingTool({
      auditId: audit.auditId,
      env: this.env,
      investigatorSessionId: this.sessionId,
      shardId: audit.shardId ?? null,
    });
  }

  protected getRoleActiveToolNames(_audit: AuditConfig): string[] {
    return [SUBMIT_AUDIT_FINDING_TOOL_NAME];
  }
}
