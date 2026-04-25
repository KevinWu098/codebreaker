/** Control-plane benchmark harness uses this session id prefix. */
export const BENCHMARK_SESSION_PREFIX = "bench-" as const;

export const getBenchmarkRunIdFromSessionId = (
  sessionId: string
): string | null => {
  if (!sessionId.startsWith(BENCHMARK_SESSION_PREFIX)) {
    return null;
  }

  const runId = sessionId.slice(BENCHMARK_SESSION_PREFIX.length);
  return runId || null;
};

export const isBenchmarkHarnessSession = (sessionId: string): boolean =>
  getBenchmarkRunIdFromSessionId(sessionId) !== null;
