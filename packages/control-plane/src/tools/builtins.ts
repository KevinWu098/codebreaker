import { createWorkspaceStateBackend, type Workspace } from "@cloudflare/shell";
import { createExecuteTool } from "@cloudflare/think/tools/execute";
import { createWorkspaceTools } from "@cloudflare/think/tools/workspace";
import {
  THINK_TOOL_CAPABILITY_IDS,
  type ToolCapabilityId,
} from "@codebreaker/benchmark-runner/agent-core/tools";
import { ModalExecutor } from "@codebreaker/control-plane/sandbox/modal";
import { createDeepWikiTools } from "@codebreaker/control-plane/tools/deepwiki";
import { createHttpTools } from "@codebreaker/control-plane/tools/http";
import { createModalTools } from "@codebreaker/control-plane/tools/modal";
import {
  activeToolNamesForPolicy,
  filterToolsByPolicy,
  mergeTieredToolSets,
  type TieredToolSet,
  ToolTier,
} from "@codebreaker/control-plane/tools/tiers";
import type { Env } from "@codebreaker/control-plane/types";
import type { ExtensionPolicy } from "@codebreaker/shared/schemas/primitives";
import type { SandboxProfileName } from "@codebreaker/shared/schemas/sandbox";

export interface BuiltinToolOptions {
  defaultRemoteTimeoutSeconds?: () => number | undefined;
  defaultSandboxProfile?: SandboxProfileName;
  env: Env;
  policy: ExtensionPolicy;
  sessionId: string;
  workspace: Workspace;
}

const CAPABILITY_TIERS = {
  benchmark_submission: ToolTier.Read,
  deepwiki_orientation: ToolTier.Network,
  local_execute: ToolTier.ExecLocal,
  public_http_fetch: ToolTier.Network,
  remote_execute: ToolTier.ExecRemote,
  remote_file_read: ToolTier.ExecRemote,
  remote_file_write: ToolTier.ExecRemote,
  session_memory_read: ToolTier.Read,
  session_memory_write: ToolTier.WriteLocal,
  workspace_read: ToolTier.Read,
  workspace_write: ToolTier.WriteLocal,
} as const satisfies Record<ToolCapabilityId, ToolTier>;

const THINK_TOOL_TIERS = Object.fromEntries(
  Object.entries(THINK_TOOL_CAPABILITY_IDS)
    .filter(([, capabilityId]) => capabilityId !== "benchmark_submission")
    .map(([toolName, capabilityId]) => [
      toolName,
      CAPABILITY_TIERS[capabilityId],
    ])
);

export const createBuiltinTools = ({
  defaultRemoteTimeoutSeconds,
  defaultSandboxProfile,
  env,
  policy,
  sessionId,
  workspace,
}: BuiltinToolOptions): TieredToolSet => {
  const deepWikiTools = createDeepWikiTools();
  const httpTools = createHttpTools();
  const modalTools = createModalTools({
    ...(defaultRemoteTimeoutSeconds
      ? { defaultTimeoutSeconds: defaultRemoteTimeoutSeconds }
      : {}),
    executor: ModalExecutor.fromEnv(env),
    sessionId,
    ...(defaultSandboxProfile ? { defaultProfile: defaultSandboxProfile } : {}),
  });
  const executeTools = createExecuteTools(env, workspace);
  const allTools = mergeTieredToolSets(
    deepWikiTools,
    httpTools,
    modalTools,
    executeTools
  );

  return {
    tiers: allTools.tiers,
    tools: filterToolsByPolicy(allTools, policy),
  };
};

export const activeBuiltinToolNames = (policy: ExtensionPolicy): string[] =>
  activeToolNamesForPolicy(THINK_TOOL_TIERS, policy);

const createExecuteTools = (env: Env, workspace: Workspace): TieredToolSet => {
  const workspaceTools = createWorkspaceTools(workspace);

  return {
    tiers: {
      execute: ToolTier.ExecLocal,
    },
    tools: {
      execute: createExecuteTool({
        globalOutbound: null,
        loader: env.LOADER,
        state: createWorkspaceStateBackend(workspace),
        tools: workspaceTools,
      }),
    },
  };
};
