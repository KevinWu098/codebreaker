import {
  type AuditAgentState,
  BaseAuditAgent,
} from "@codebreaker/control-plane/audits/agent-base";
import {
  COORDINATOR_TOOL_NAMES,
  createCoordinatorTools,
} from "@codebreaker/control-plane/audits/coordinator-tools";
import type { TieredToolSet } from "@codebreaker/control-plane/tools/tiers";
import type { AuditConfig } from "@codebreaker/shared/schemas/audits";

export class AuditCoordinatorAgent extends BaseAuditAgent {
  initialState: AuditAgentState = { status: "pending" };

  protected getRoleTools(_audit: AuditConfig): TieredToolSet {
    const config = this.requireConfig();
    return createCoordinatorTools({
      baseSessionConfig: config,
      coordinatorSessionId: this.sessionId,
      env: this.env,
    });
  }

  protected getRoleActiveToolNames(_audit: AuditConfig): string[] {
    return COORDINATOR_TOOL_NAMES;
  }
}
