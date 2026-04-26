import type {
  ExecRemoteOptions,
  ModalExecutor,
} from "@codebreaker/control-plane/sandbox/modal";
import {
  type TieredToolSet,
  ToolTier,
} from "@codebreaker/control-plane/tools/tiers";
import { base64ToBytes, bytesToBase64 } from "@codebreaker/shared/lib/base64";
import type {
  ExecResult,
  SandboxProfileName,
} from "@codebreaker/shared/schemas/sandbox";
import { tool } from "ai";
import { z } from "zod";

const ExecRemoteInputSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().min(1).optional(),
  timeoutSeconds: z.number().int().positive().optional(),
});

const GIT_COMMAND_RE = /\bgit\b/;
const GIT_METADATA_PATH_RE = /(^|[/\\\s"'`])\.git([/\\\s"'`]|$)/;
const MODAL_TOOL_MAX_TIMEOUT_SECONDS = 15;
const EXEC_REMOTE_MAX_TIMEOUT_SECONDS = MODAL_TOOL_MAX_TIMEOUT_SECONDS;
const REMOTE_READ_DEFAULT_MAX_BYTES = 24_000;
const REMOTE_READ_HARD_MAX_BYTES = 96_000;
// Tool calls are bounded by `withToolTimeout`; the underlying HTTP request
// budget must be strictly tighter so we never wait past the tool-level cap.
// The shim itself has a 1s grace window over the requested exec timeout, so
// the per-attempt HTTP budget is set to (cap - 1)s for non-exec tools and
// (cap + grace)ms for exec.
const MODAL_TOOL_REQUEST_TIMEOUT_MS =
  (MODAL_TOOL_MAX_TIMEOUT_SECONDS - 1) * 1000;
// Tool-context HTTP attempts: a single attempt; a transient error surfaces as
// a structured tool failure instead of multiplying wall-clock by retrying 3x.
const MODAL_TOOL_MAX_ATTEMPTS = 1;

const RemoteReadInputSchema = z.object({
  maxBytes: z
    .number()
    .int()
    .positive()
    .max(REMOTE_READ_HARD_MAX_BYTES)
    .optional(),
  path: z.string().min(1),
});

const RemoteWriteInputSchema = z.object({
  contentBase64: z.string().min(1),
  path: z.string().min(1),
});

interface RemoteWriteResult {
  error?: string;
  ok: boolean;
  path: string;
  timedOut: boolean;
}

interface RemoteReadResult {
  contentBase64: string;
  error?: string;
  hint?: string;
  path: string;
  timedOut: boolean;
  totalBytes: number;
  truncated: boolean;
}

export interface ModalToolOptions {
  defaultProfile?: SandboxProfileName;
  defaultTimeoutSeconds?: () => number | undefined;
  executor: ModalExecutor;
  sessionId: string;
}

export const createModalTools = ({
  defaultProfile,
  defaultTimeoutSeconds,
  executor,
  sessionId,
}: ModalToolOptions): TieredToolSet => ({
  tiers: {
    exec_remote: ToolTier.ExecRemote,
    remote_read: ToolTier.ExecRemote,
    remote_write: ToolTier.ExecRemote,
  },
  tools: {
    exec_remote: tool({
      description:
        "Run a command in the session's configured remote Modal sandbox. Requires sandbox policy. Calls are capped at 15 seconds and return a timed-out result if they exceed that budget. Git commands are blocked; inspect the existing checkout with shell listing/search/read commands instead.",
      inputSchema: ExecRemoteInputSchema,
      execute: ({ command, cwd, timeoutSeconds }) => {
        assertNoGitCommand(command);
        if (cwd) {
          assertNoGitMetadataPath(cwd);
        }
        const fallbackTimeoutSeconds = defaultTimeoutSeconds?.();
        const effectiveTimeoutSeconds = Math.min(
          timeoutSeconds ??
            fallbackTimeoutSeconds ??
            EXEC_REMOTE_MAX_TIMEOUT_SECONDS,
          EXEC_REMOTE_MAX_TIMEOUT_SECONDS
        );

        return withCancellableToolTimeout<ExecResult>(
          (signal) => {
            const options: ExecRemoteOptions = {
              abortSignal: signal,
              command,
              maxAttempts: MODAL_TOOL_MAX_ATTEMPTS,
              sessionId,
              timeoutSeconds: effectiveTimeoutSeconds,
            };

            if (defaultProfile) {
              options.profile = defaultProfile;
            }

            if (cwd) {
              options.cwd = cwd;
            }

            return executor.exec(options);
          },
          effectiveTimeoutSeconds,
          () => buildExecTimedOutResult(command, effectiveTimeoutSeconds),
          (error) => buildExecErrorResult(command, error)
        );
      },
    }),
    remote_read: tool({
      description: `Read a file from the session's configured remote Modal sandbox and return base64 content. .git metadata paths are blocked. Calls are capped at ${MODAL_TOOL_MAX_TIMEOUT_SECONDS} seconds and return a timed-out result if they exceed that budget. Output is truncated to a budget-friendly window; for larger reads use exec_remote with \`sed -n 'A,Bp'\`, \`head\`, \`tail\`, or \`grep -n -C\`.`,
      inputSchema: RemoteReadInputSchema,
      execute: ({ maxBytes, path }) => {
        assertNoGitMetadataPath(path);
        const limit = Math.min(
          maxBytes ?? REMOTE_READ_DEFAULT_MAX_BYTES,
          REMOTE_READ_HARD_MAX_BYTES
        );

        return withCancellableToolTimeout<RemoteReadResult>(
          async (signal) => {
            const input: {
              abortSignal: AbortSignal;
              maxAttempts: number;
              path: string;
              profile?: SandboxProfileName;
              sessionId: string;
              timeoutMs: number;
            } = {
              abortSignal: signal,
              maxAttempts: MODAL_TOOL_MAX_ATTEMPTS,
              path,
              sessionId,
              timeoutMs: MODAL_TOOL_REQUEST_TIMEOUT_MS,
            };
            if (defaultProfile) {
              input.profile = defaultProfile;
            }
            const content = await executor.readFile(input);
            const totalBytes = content.byteLength;
            const truncated = totalBytes > limit;
            const slice = truncated ? content.subarray(0, limit) : content;
            const result: RemoteReadResult = {
              contentBase64: bytesToBase64(slice),
              path,
              timedOut: false,
              totalBytes,
              truncated,
            };
            if (truncated) {
              result.hint = `File is ${totalBytes} bytes; only the first ${limit} bytes are returned. To inspect more, use exec_remote with sed -n 'A,Bp', head, tail, or grep -n -C against this path.`;
            }
            return result;
          },
          MODAL_TOOL_MAX_TIMEOUT_SECONDS,
          () => ({
            contentBase64: "",
            error: `remote_read for ${path} exceeded the ${MODAL_TOOL_MAX_TIMEOUT_SECONDS}s timeout. Retry with a more specific path or use exec_remote with a small sed/head range and continue.`,
            path,
            timedOut: true,
            totalBytes: 0,
            truncated: false,
          }),
          (error) => ({
            contentBase64: "",
            error: `remote_read for ${path} failed: ${errorMessage(error)}`,
            path,
            timedOut: false,
            totalBytes: 0,
            truncated: false,
          })
        );
      },
    }),
    remote_write: tool({
      description: `Write base64 content to a file in the session's configured remote Modal sandbox. Calls are capped at ${MODAL_TOOL_MAX_TIMEOUT_SECONDS} seconds and return a timed-out result if they exceed that budget.`,
      inputSchema: RemoteWriteInputSchema,
      execute: ({ contentBase64, path }) => {
        assertNoGitMetadataPath(path);
        return withCancellableToolTimeout<RemoteWriteResult>(
          async (signal) => {
            const input: {
              abortSignal: AbortSignal;
              content: Uint8Array;
              maxAttempts: number;
              path: string;
              profile?: SandboxProfileName;
              sessionId: string;
              timeoutMs: number;
            } = {
              abortSignal: signal,
              content: base64ToBytes(contentBase64),
              maxAttempts: MODAL_TOOL_MAX_ATTEMPTS,
              path,
              sessionId,
              timeoutMs: MODAL_TOOL_REQUEST_TIMEOUT_MS,
            };
            if (defaultProfile) {
              input.profile = defaultProfile;
            }
            await executor.writeFile(input);
            return { ok: true, path, timedOut: false };
          },
          MODAL_TOOL_MAX_TIMEOUT_SECONDS,
          () => ({
            error: `remote_write for ${path} exceeded the ${MODAL_TOOL_MAX_TIMEOUT_SECONDS}s timeout. Reduce the payload size or split the write across multiple calls and continue.`,
            ok: false,
            path,
            timedOut: true,
          }),
          (error) => ({
            error: `remote_write for ${path} failed: ${errorMessage(error)}`,
            ok: false,
            path,
            timedOut: false,
          })
        );
      },
    }),
  },
});

const assertNoGitCommand = (command: string): void => {
  if (GIT_COMMAND_RE.test(command)) {
    throw new Error(
      "Git commands are blocked in benchmark sandbox tool calls. Use ls, grep, sed, head, tail, or remote_read against the existing checkout instead."
    );
  }
};

const assertNoGitMetadataPath = (path: string): void => {
  if (GIT_METADATA_PATH_RE.test(path)) {
    throw new Error(
      "Reading or writing .git metadata is blocked for benchmark integrity. Inspect checked-out source files only."
    );
  }
};

const buildExecTimedOutResult = (
  command: string,
  timeoutSeconds: number
): ExecResult => ({
  command,
  durationMs: timeoutSeconds * 1000,
  exitCode: 124,
  stderr: `Command exceeded the ${timeoutSeconds}s exec_remote timeout. Narrow the search, scope the directory, add --include filters, or use a smaller head/sed range and continue.`,
  stderrTruncated: false,
  stdout: "",
  stdoutTruncated: false,
  timedOut: true,
});

const buildExecErrorResult = (command: string, error: unknown): ExecResult => ({
  command,
  durationMs: 0,
  exitCode: 125,
  stderr: `exec_remote failed: ${errorMessage(error)}. Narrow the command, retry once, or fall back to remote_read on a specific path.`,
  stderrTruncated: false,
  stdout: "",
  stdoutTruncated: false,
  timedOut: false,
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Race a tool-issued promise against a hard wall-clock cap, returning a
 * structured `buildTimeoutResult()` on timeout and a structured
 * `buildErrorResult()` on rejection. The tool function receives an
 * `AbortSignal` it must plumb into the underlying transport so a timeout
 * actually cancels the in-flight request — without this, leaked requests
 * keep consuming Modal-shim sockets long after the agent has moved on, and
 * a flapping shim can wedge the agent between turns.
 */
const withCancellableToolTimeout = async <T>(
  factory: (signal: AbortSignal) => Promise<T>,
  timeoutSeconds: number,
  buildTimeoutResult: () => T,
  buildErrorResult: (error: unknown) => T
): Promise<T> => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      resolve(buildTimeoutResult());
    }, timeoutSeconds * 1000);
  });

  const work = (async () => {
    try {
      return await factory(controller.signal);
    } catch (error) {
      // If we already raced the timeout to completion, swallow the
      // post-cancel rejection so the timeout result wins.
      if (timedOut) {
        return buildTimeoutResult();
      }
      return buildErrorResult(error);
    }
  })();

  try {
    return await Promise.race([work, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
};
