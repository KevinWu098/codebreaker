export const POLLING = {
  admin: {
    health: 10_000,
    sandboxes: 8000,
  },
  benchmarks: {
    cveFollowup: 5000,
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
