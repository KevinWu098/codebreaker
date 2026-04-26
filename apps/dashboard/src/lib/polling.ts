import type { CveFollowupDetailResponse } from "@codebreaker/benchmark-runner/schemas";

export const POLLING = {
  admin: {
    health: 10_000,
    sandboxes: 8000,
  },
  audits: {
    detail: 4000,
    findings: 5000,
    list: 5000,
  },
  benchmarks: {
    /** Default when no active review stage needs faster Devin / stage updates */
    cveFollowup: 5000,
    /**
     * While a review stage is in flight, poll more often for `liveDevinStatus`
     * and server-enriched state (GET follow-up also runs `reconcileOne`).
     */
    cveFollowupReview: 2000,
    cveFollowupsList: 8000,
    runDetail: 5000,
    runs: 5000,
    tasks: 30_000,
  },
  health: 10_000,
  sessions: {
    artifacts: 5000,
    detail: 4000,
    list: 5000,
    messages: 5000,
    sandbox: 5000,
    state: 4000,
  },
} as const;

export const getCveFollowupPollIntervalMs = (
  data: CveFollowupDetailResponse | null | undefined
): number => {
  if (!data) {
    return POLLING.benchmarks.cveFollowup;
  }
  for (const s of data.stages) {
    if (
      (s.kind === "review_repro" || s.kind === "review_fix") &&
      (s.status === "pending" ||
        s.status === "dispatched" ||
        s.status === "validating")
    ) {
      return POLLING.benchmarks.cveFollowupReview;
    }
  }
  return POLLING.benchmarks.cveFollowup;
};
