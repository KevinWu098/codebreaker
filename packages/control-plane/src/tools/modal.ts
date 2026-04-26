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
const MODAL_TOOL_MAX_TIMEOUT_SECONDS = 15;
const EXEC_REMOTE_MAX_TIMEOUT_SECONDS = MODAL_TOOL_MAX_TIMEOUT_SECONDS;
const REMOTE_READ_DEFAULT_MAX_BYTES = 24_000;
const REMOTE_READ_HARD_MAX_BYTES = 96_000;

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
        const fallbackTimeoutSeconds = defaultTimeoutSeconds?.();
        const options: ExecRemoteOptions = {
          command,
          sessionId,
        };

        if (defaultProfile) {
          options.profile = defaultProfile;
        }

        if (cwd) {
          options.cwd = cwd;
        }

        const effectiveTimeoutSeconds = Math.min(
          timeoutSeconds ??
            fallbackTimeoutSeconds ??
            EXEC_REMOTE_MAX_TIMEOUT_SECONDS,
          EXEC_REMOTE_MAX_TIMEOUT_SECONDS
        );

        options.timeoutSeconds = effectiveTimeoutSeconds;

        return withExecTimeout(
          executor.exec(options),
          command,
          effectiveTimeoutSeconds
        );
      },
    }),
    remote_read: tool({
      description: `Read a file from the session's configured remote Modal sandbox and return base64 content. Calls are capped at ${MODAL_TOOL_MAX_TIMEOUT_SECONDS} seconds and return a timed-out result if they exceed that budget. Output is truncated to a budget-friendly window; for larger reads use exec_remote with \`sed -n 'A,Bp'\`, \`head\`, \`tail\`, or \`grep -n -C\`.`,
      inputSchema: RemoteReadInputSchema,
      execute: ({ maxBytes, path }) => {
        const input: {
          path: string;
          profile?: SandboxProfileName;
          sessionId: string;
        } = {
          path,
          sessionId,
        };

        if (defaultProfile) {
          input.profile = defaultProfile;
        }

        const limit = Math.min(
          maxBytes ?? REMOTE_READ_DEFAULT_MAX_BYTES,
          REMOTE_READ_HARD_MAX_BYTES
        );

        return withToolTimeout(
          (async () => {
            const content = await executor.readFile(input);
            const totalBytes = content.byteLength;
            const truncated = totalBytes > limit;
            const slice = truncated ? content.subarray(0, limit) : content;
            const result: {
              contentBase64: string;
              path: string;
              timedOut: boolean;
              totalBytes: number;
              truncated: boolean;
              error?: string;
              hint?: string;
            } = {
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
          })(),
          MODAL_TOOL_MAX_TIMEOUT_SECONDS,
          () => ({
            contentBase64: "",
            error: `remote_read for ${path} exceeded the ${MODAL_TOOL_MAX_TIMEOUT_SECONDS}s timeout. Retry with a more specific path or use exec_remote with a small sed/head range and continue.`,
            path,
            timedOut: true,
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
        const input: {
          content: Uint8Array;
          path: string;
          profile?: SandboxProfileName;
          sessionId: string;
        } = {
          content: base64ToBytes(contentBase64),
          path,
          sessionId,
        };

        if (defaultProfile) {
          input.profile = defaultProfile;
        }

        return withToolTimeout<RemoteWriteResult>(
          executor.writeFile(input).then(() => ({
            ok: true,
            path,
            timedOut: false,
          })),
          MODAL_TOOL_MAX_TIMEOUT_SECONDS,
          () => ({
            error: `remote_write for ${path} exceeded the ${MODAL_TOOL_MAX_TIMEOUT_SECONDS}s timeout. Reduce the payload size or split the write across multiple calls and continue.`,
            ok: false,
            path,
            timedOut: true,
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

const withExecTimeout = (
  promise: Promise<ExecResult>,
  command: string,
  timeoutSeconds: number
): Promise<ExecResult> =>
  withToolTimeout(promise, timeoutSeconds, () => ({
    command,
    durationMs: timeoutSeconds * 1000,
    exitCode: 124,
    stderr: `Command exceeded the ${timeoutSeconds}s exec_remote timeout. Narrow the search, scope the directory, add --include filters, or use a smaller head/sed range and continue.`,
    stderrTruncated: false,
    stdout: "",
    stdoutTruncated: false,
    timedOut: true,
  }));

const withToolTimeout = async <T>(
  promise: Promise<T>,
  timeoutSeconds: number,
  buildTimeoutResult: () => T
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve(buildTimeoutResult());
    }, timeoutSeconds * 1000);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
};
