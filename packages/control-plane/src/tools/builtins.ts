import { createWorkspaceStateBackend, type Workspace } from "@cloudflare/shell";
import { createExecuteTool } from "@cloudflare/think/tools/execute";
import { createWorkspaceTools } from "@cloudflare/think/tools/workspace";
import { ModalExecutor } from "@codebreaker/control-plane/sandbox/modal";
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

const WORKSPACE_TOOL_TIERS = {
  delete: ToolTier.WriteLocal,
  edit: ToolTier.WriteLocal,
  find: ToolTier.Read,
  grep: ToolTier.Read,
  list: ToolTier.Read,
  read: ToolTier.Read,
  write: ToolTier.WriteLocal,
} as const;

const SESSION_TOOL_TIERS = {
  load_context: ToolTier.Read,
  search_context: ToolTier.Read,
  set_context: ToolTier.WriteLocal,
} as const;

export const createBuiltinTools = ({
  defaultRemoteTimeoutSeconds,
  defaultSandboxProfile,
  env,
  policy,
  sessionId,
  workspace,
}: BuiltinToolOptions): TieredToolSet => {
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
  const allTools = mergeTieredToolSets(httpTools, modalTools, executeTools);

  return {
    tiers: allTools.tiers,
    tools: filterToolsByPolicy(allTools, policy),
  };
};

export const activeBuiltinToolNames = (policy: ExtensionPolicy): string[] =>
  activeToolNamesForPolicy(
    {
      ...WORKSPACE_TOOL_TIERS,
      ...SESSION_TOOL_TIERS,
      ...createHttpTools().tiers,
      execute: ToolTier.ExecLocal,
      exec_remote: ToolTier.ExecRemote,
      remote_read: ToolTier.ExecRemote,
      remote_write: ToolTier.ExecRemote,
    },
    policy
  );

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
