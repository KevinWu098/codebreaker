import type {
  ExecRemoteOptions,
  ModalExecutor,
} from "@codebreaker/control-plane/sandbox/modal";
import {
  type TieredToolSet,
  ToolTier,
} from "@codebreaker/control-plane/tools/tiers";
import { base64ToBytes, bytesToBase64 } from "@codebreaker/shared/lib/base64";
import type { SandboxProfileName } from "@codebreaker/shared/schemas/sandbox";
import { tool } from "ai";
import { z } from "zod";

const ExecRemoteInputSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().min(1).optional(),
  timeoutSeconds: z.number().int().positive().optional(),
});

const GIT_COMMAND_RE = /\bgit\b/;
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
        "Run a command in the session's configured remote Modal sandbox. Requires sandbox policy. Git commands are blocked; inspect the existing checkout with shell listing/search/read commands instead.",
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

        const effectiveTimeoutSeconds =
          timeoutSeconds && fallbackTimeoutSeconds
            ? Math.min(timeoutSeconds, fallbackTimeoutSeconds)
            : (timeoutSeconds ?? fallbackTimeoutSeconds);

        if (effectiveTimeoutSeconds) {
          options.timeoutSeconds = effectiveTimeoutSeconds;
        }

        return executor.exec(options);
      },
    }),
    remote_read: tool({
      description:
        "Read a file from the session's configured remote Modal sandbox and return base64 content. Output is truncated to a budget-friendly window; for larger reads use exec_remote with `sed -n 'A,Bp'`, `head`, `tail`, or `grep -n -C`.",
      inputSchema: RemoteReadInputSchema,
      execute: async ({ maxBytes, path }) => {
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

        const content = await executor.readFile(input);
        const limit = Math.min(
          maxBytes ?? REMOTE_READ_DEFAULT_MAX_BYTES,
          REMOTE_READ_HARD_MAX_BYTES
        );
        const totalBytes = content.byteLength;
        const truncated = totalBytes > limit;
        const slice = truncated ? content.subarray(0, limit) : content;

        const result: {
          contentBase64: string;
          path: string;
          totalBytes: number;
          truncated: boolean;
          hint?: string;
        } = {
          contentBase64: bytesToBase64(slice),
          path,
          totalBytes,
          truncated,
        };

        if (truncated) {
          result.hint = `File is ${totalBytes} bytes; only the first ${limit} bytes are returned. To inspect more, use exec_remote with sed -n 'A,Bp', head, tail, or grep -n -C against this path.`;
        }

        return result;
      },
    }),
    remote_write: tool({
      description:
        "Write base64 content to a file in the session's configured remote Modal sandbox.",
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

        return executor.writeFile(input);
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
