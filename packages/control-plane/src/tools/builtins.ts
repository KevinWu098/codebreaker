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

export interface BuiltinToolOptions {
  env: Env;
  policy: ExtensionPolicy;
  sessionId: string;
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
  env,
  policy,
  sessionId,
}: BuiltinToolOptions): TieredToolSet => {
  const httpTools = createHttpTools();
  const modalTools = createModalTools({
    executor: ModalExecutor.fromEnv(env),
    sessionId,
  });
  const allTools = mergeTieredToolSets(httpTools, modalTools);

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
      exec_remote: ToolTier.ExecRemote,
      remote_read: ToolTier.ExecRemote,
      remote_write: ToolTier.ExecRemote,
    },
    policy
  );
