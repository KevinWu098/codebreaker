import { AuditStore } from "@codebreaker/control-plane/db/audits";
import {
  type TieredToolSet,
  ToolTier,
} from "@codebreaker/control-plane/tools/tiers";
import type { Env } from "@codebreaker/control-plane/types";
import {
  type AuditFindingRow,
  AuditFindingSubmissionSchema,
  type AuditValidationSubmission,
  AuditValidationSubmissionSchema,
} from "@codebreaker/shared/schemas/audits";
import { tool } from "ai";

export const SUBMIT_AUDIT_FINDING_TOOL_NAME = "submit_audit_finding" as const;
export const SUBMIT_AUDIT_VALIDATION_TOOL_NAME = "submit_validation" as const;

export interface AuditFindingToolContext {
  auditId: string;
  env: Env;
  investigatorSessionId: string;
  shardId: string | null;
}

/**
 * Tool exposed to InvestigatorAgent. Persists a candidate finding directly
 * into D1 so the coordinator can pick it up after the child chat resolves.
 */
export const createSubmitAuditFindingTool = (
  context: AuditFindingToolContext,
  onFinding?: (finding: AuditFindingRow) => void
): TieredToolSet => ({
  tiers: {
    [SUBMIT_AUDIT_FINDING_TOOL_NAME]: ToolTier.Read,
  },
  tools: {
    [SUBMIT_AUDIT_FINDING_TOOL_NAME]: tool({
      description:
        "Submit a candidate vulnerability finding for the current shard. Provide concrete file/function locations, an evidence snippet from inspected code, and a calibrated confidence in [0,1]. The argument shape is validated. Use this whenever you have surfaced a credible novel vulnerability — do not write JSON in chat.",
      execute: async (input) => {
        const submission = AuditFindingSubmissionSchema.parse(input);
        const store = new AuditStore(context.env.DB);
        const finding = await store.createFinding({
          auditId: context.auditId,
          shardId: context.shardId,
          submission,
        });
        await store.addEvent({
          auditId: context.auditId,
          details: {
            confidence: finding.confidence,
            findingId: finding.id,
            severity: finding.severity,
            shardId: context.shardId,
            sessionId: context.investigatorSessionId,
            vulnClass: finding.vulnClass,
          },
          kind: "candidate_recorded",
          message: `Investigator surfaced a candidate ${finding.vulnClass} (${finding.severity}, conf=${finding.confidence})`,
        });

        if (onFinding) {
          onFinding(finding);
        }

        return `Recorded candidate finding ${finding.id} (${finding.vulnClass}, severity=${finding.severity}, confidence=${finding.confidence}).`;
      },
      inputSchema: AuditFindingSubmissionSchema,
    }),
  },
});

export interface AuditValidationToolContext {
  env: Env;
  findingId: string;
  validatorSessionId: string;
}

/**
 * Tool exposed to ValidatorAgent. Records a verdict (`confirm` or `dismiss`)
 * against a candidate finding, optionally tightening location and severity.
 */
export const createSubmitAuditValidationTool = (
  context: AuditValidationToolContext,
  onValidation?: (submission: AuditValidationSubmission) => void
): TieredToolSet => ({
  tiers: {
    [SUBMIT_AUDIT_VALIDATION_TOOL_NAME]: ToolTier.Read,
  },
  tools: {
    [SUBMIT_AUDIT_VALIDATION_TOOL_NAME]: tool({
      description:
        "Submit a validation verdict for the candidate finding under review. `confirm` keeps it as a validated finding (with refined locations/severity if you found tighter evidence). `dismiss` marks it as a false positive. Provide notes explaining your reasoning. Call this exactly once per validation turn — do not write JSON in chat.",
      execute: async (input) => {
        const submission = AuditValidationSubmissionSchema.parse(input);
        const store = new AuditStore(context.env.DB);
        const finding = await store.applyValidation({
          findingId: context.findingId,
          submission,
          validatorSessionId: context.validatorSessionId,
        });

        await store.addEvent({
          auditId: finding.auditId,
          details: {
            confidence: finding.confidence,
            findingId: finding.id,
            sessionId: context.validatorSessionId,
            verdict: submission.verdict,
          },
          kind:
            submission.verdict === "confirm"
              ? "finding_validated"
              : "finding_dismissed",
          message:
            submission.verdict === "confirm"
              ? `Validator confirmed finding ${finding.id} at confidence ${finding.confidence}`
              : `Validator dismissed finding ${finding.id}: ${submission.notes.slice(0, 120)}`,
        });

        if (onValidation) {
          onValidation(submission);
        }

        return `Recorded ${submission.verdict} verdict for finding ${finding.id}.`;
      },
      inputSchema: AuditValidationSubmissionSchema,
    }),
  },
});
