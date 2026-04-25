import type { ExtensionPolicy } from "@codebreaker/shared/schemas/primitives";
import type { ToolSet } from "ai";

export const ToolTier = {
  Read: 0,
  WriteLocal: 1,
  ExecLocal: 2,
  Network: 3,
  ExecRemote: 4,
  Exploit: 5,
} as const;

export type ToolTier = (typeof ToolTier)[keyof typeof ToolTier];

export interface TieredToolSet {
  tiers: Record<string, ToolTier>;
  tools: ToolSet;
}

const POLICY_MAX_TIER = {
  local: ToolTier.ExecLocal,
  network: ToolTier.Network,
  readonly: ToolTier.Read,
  sandbox: ToolTier.ExecRemote,
  unrestricted: ToolTier.Exploit,
  workspace: ToolTier.WriteLocal,
} as const satisfies Record<ExtensionPolicy, ToolTier>;

export const maxTierForPolicy = (policy: ExtensionPolicy): ToolTier =>
  POLICY_MAX_TIER[policy];

export const isTierAllowed = (
  tier: ToolTier,
  policy: ExtensionPolicy
): boolean => tier <= maxTierForPolicy(policy);

export const filterToolsByPolicy = (
  tieredTools: TieredToolSet,
  policy: ExtensionPolicy
): ToolSet => {
  const allowedTools: ToolSet = {};

  for (const [name, tool] of Object.entries(tieredTools.tools)) {
    const tier = tieredTools.tiers[name];

    if (tier !== undefined && isTierAllowed(tier, policy)) {
      allowedTools[name] = tool;
    }
  }

  return allowedTools;
};

export const activeToolNamesForPolicy = (
  tiers: Record<string, ToolTier>,
  policy: ExtensionPolicy
): string[] =>
  Object.entries(tiers)
    .filter(([, tier]) => isTierAllowed(tier, policy))
    .map(([name]) => name);
