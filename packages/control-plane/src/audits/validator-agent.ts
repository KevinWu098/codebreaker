import {
  type AuditAgentState,
  BaseAuditAgent,
} from "@codebreaker/control-plane/audits/agent-base";
import {
  createSubmitAuditValidationTool,
  SUBMIT_AUDIT_VALIDATION_TOOL_NAME,
} from "@codebreaker/control-plane/tools/audit-finding";
import type { TieredToolSet } from "@codebreaker/control-plane/tools/tiers";
import type { AuditConfig } from "@codebreaker/shared/schemas/audits";

export class AuditValidatorAgent extends BaseAuditAgent {
  initialState: AuditAgentState = { status: "pending" };

  protected getRoleTools(audit: AuditConfig): TieredToolSet {
    if (!audit.findingId) {
      throw new Error("Validator agent requires audit.findingId");
    }
    return createSubmitAuditValidationTool({
      env: this.env,
      findingId: audit.findingId,
      validatorSessionId: this.sessionId,
    });
  }

  protected getRoleActiveToolNames(_audit: AuditConfig): string[] {
    return [SUBMIT_AUDIT_VALIDATION_TOOL_NAME];
  }

  protected getRoleSubmissionToolNames(_audit: AuditConfig): string[] {
    return [SUBMIT_AUDIT_VALIDATION_TOOL_NAME];
  }
}
