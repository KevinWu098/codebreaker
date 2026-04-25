import type {
  ExecRemoteOptions,
  ModalExecutor,
} from "@codebreaker/control-plane/sandbox/modal";
import {
  type TieredToolSet,
  ToolTier,
} from "@codebreaker/control-plane/tools/tiers";
import { base64ToBytes, bytesToBase64 } from "@codebreaker/shared/lib/base64";
import { SandboxProfileNameSchema } from "@codebreaker/shared/schemas/sandbox";
import { tool } from "ai";
import { z } from "zod";

const ExecRemoteInputSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().min(1).optional(),
  profile: SandboxProfileNameSchema.optional(),
  timeoutSeconds: z.number().int().positive().optional(),
});

const RemoteReadInputSchema = z.object({
  path: z.string().min(1),
  profile: SandboxProfileNameSchema.optional(),
});

const RemoteWriteInputSchema = z.object({
  contentBase64: z.string().min(1),
  path: z.string().min(1),
  profile: SandboxProfileNameSchema.optional(),
});

export interface ModalToolOptions {
  executor: ModalExecutor;
  sessionId: string;
}

export const createModalTools = ({
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
        "Run a command in the session's remote Modal sandbox. Requires sandbox policy.",
      inputSchema: ExecRemoteInputSchema,
      execute: ({ command, cwd, profile, timeoutSeconds }) => {
        const options: ExecRemoteOptions = {
          command,
          sessionId,
        };

        if (cwd) {
          options.cwd = cwd;
        }

        if (profile) {
          options.profile = profile;
        }

        if (timeoutSeconds) {
          options.timeoutSeconds = timeoutSeconds;
        }

        return executor.exec(options);
      },
    }),
    remote_read: tool({
      description:
        "Read a file from the session's remote Modal sandbox and return base64 content.",
      inputSchema: RemoteReadInputSchema,
      execute: async ({ path, profile }) => {
        const input = {
          path,
          sessionId,
        };

        if (profile) {
          Object.assign(input, { profile });
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
        "Write base64 content to a file in the session's remote Modal sandbox.",
      inputSchema: RemoteWriteInputSchema,
      execute: ({ contentBase64, path, profile }) => {
        const input = {
          content: base64ToBytes(contentBase64),
          path,
          sessionId,
        };

        if (profile) {
          Object.assign(input, { profile });
        }

        return executor.writeFile(input);
      },
    }),
  },
});
