export const BENCHMARK_SESSION_PREFIX = "bench-";

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

/** Coordinator, investigator, and validator session ids all embed the audit UUID after `audit-`. */
const AUDIT_SESSION_AUDIT_ID_RE =
  /^audit-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:$|-inv-|-val-)/;

export const getAuditIdFromSessionId = (sessionId: string): string | null => {
  const m = sessionId.match(AUDIT_SESSION_AUDIT_ID_RE);
  return m?.[1] ?? null;
};

export const isAuditSessionId = (sessionId: string): boolean =>
  getAuditIdFromSessionId(sessionId) !== null;
const TRAILING_SLASHES_RE = /\/+$/;

export const trimTrailingSlash = (value: string): string =>
  value.replace(TRAILING_SLASHES_RE, "");

export const nowIso = (): string => new Date().toISOString();

export const assertNever = (value: never): never => {
  throw new Error(`Unexpected value: ${String(value)}`);
};

export const truncateId = (value: string, head = 8, tail = 4): string => {
  if (value.length <= head + tail + 1) {
    return value;
  }

  return `${value.slice(0, head)}…${value.slice(-tail)}`;
};
