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

const RemoteReadInputSchema = z.object({
  path: z.string().min(1),
});

const RemoteWriteInputSchema = z.object({
  contentBase64: z.string().min(1),
  path: z.string().min(1),
});

export interface ModalToolOptions {
  defaultProfile?: SandboxProfileName;
  executor: ModalExecutor;
  sessionId: string;
}

export const createModalTools = ({
  defaultProfile,
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
        "Run a command in the session's configured remote Modal sandbox. Requires sandbox policy.",
      inputSchema: ExecRemoteInputSchema,
      execute: ({ command, cwd, timeoutSeconds }) => {
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

        if (timeoutSeconds) {
          options.timeoutSeconds = timeoutSeconds;
        }

        return executor.exec(options);
      },
    }),
    remote_read: tool({
      description:
        "Read a file from the session's configured remote Modal sandbox and return base64 content.",
      inputSchema: RemoteReadInputSchema,
      execute: async ({ path }) => {
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

        return {
          contentBase64: bytesToBase64(content),
          path,
        };
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
