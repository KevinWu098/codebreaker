import { createHttpTools } from "@codebreaker/control-plane/tools/http";
import {
  activeToolNamesForPolicy,
  filterToolsByPolicy,
  type TieredToolSet,
  ToolTier,
} from "@codebreaker/control-plane/tools/tiers";
import type { ExtensionPolicy } from "@codebreaker/shared/schemas/primitives";

export interface BuiltinToolOptions {
  policy: ExtensionPolicy;
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
  policy,
}: BuiltinToolOptions): TieredToolSet => {
  const httpTools = createHttpTools();

  return {
    tiers: httpTools.tiers,
    tools: filterToolsByPolicy(httpTools, policy),
  };
};

export const activeBuiltinToolNames = (policy: ExtensionPolicy): string[] =>
  activeToolNamesForPolicy(
    {
      ...WORKSPACE_TOOL_TIERS,
      ...SESSION_TOOL_TIERS,
      ...createHttpTools().tiers,
    },
    policy
  );
