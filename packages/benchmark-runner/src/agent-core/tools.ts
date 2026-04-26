import { z } from "zod";

export const BenchmarkToolModeSchema = z.enum(["none", "local", "sandbox"]);
export type BenchmarkToolMode = z.infer<typeof BenchmarkToolModeSchema>;

export const ToolCapabilityRiskSchema = z.enum([
  "read",
  "write-local",
  "exec-local",
  "network",
  "exec-remote",
  "exploit",
]);
export type ToolCapabilityRisk = z.infer<typeof ToolCapabilityRiskSchema>;

export const ToolCapabilityIdSchema = z.enum([
  "workspace_read",
  "workspace_write",
  "session_memory_read",
  "session_memory_write",
  "local_execute",
  "remote_execute",
  "remote_file_read",
  "remote_file_write",
  "deepwiki_orientation",
  "public_http_fetch",
  "benchmark_submission",
]);
export type ToolCapabilityId = z.infer<typeof ToolCapabilityIdSchema>;

export interface ToolCapability {
  description: string;
  id: ToolCapabilityId;
  risk: ToolCapabilityRisk;
  thinkToolNames: readonly string[];
}

export const TOOL_CAPABILITIES = [
  {
    description:
      "Read workspace files and search local checkout contents without modifying state.",
    id: "workspace_read",
    risk: "read",
    thinkToolNames: ["find", "grep", "list", "read"],
  },
  {
    description:
      "Create, edit, delete, or overwrite files in the agent workspace.",
    id: "workspace_write",
    risk: "write-local",
    thinkToolNames: ["delete", "edit", "write"],
  },
  {
    description:
      "Load and search durable session context maintained by Cloudflare Think.",
    id: "session_memory_read",
    risk: "read",
    thinkToolNames: ["load_context", "search_context"],
  },
  {
    description:
      "Persist durable session context maintained by Cloudflare Think.",
    id: "session_memory_write",
    risk: "write-local",
    thinkToolNames: ["set_context"],
  },
  {
    description:
      "Run local commands through the Think execute tool in the workspace runtime.",
    id: "local_execute",
    risk: "exec-local",
    thinkToolNames: ["execute"],
  },
  {
    description:
      "Run shell commands in the configured remote sandbox for benchmark inspection.",
    id: "remote_execute",
    risk: "exec-remote",
    thinkToolNames: ["exec_remote"],
  },
  {
    description:
      "Read files from the configured remote sandbox with bounded output.",
    id: "remote_file_read",
    risk: "exec-remote",
    thinkToolNames: ["remote_read"],
  },
  {
    description: "Write files in the configured remote sandbox.",
    id: "remote_file_write",
    risk: "exec-remote",
    thinkToolNames: ["remote_write"],
  },
  {
    description:
      "Ask DeepWiki for repository orientation and architecture context.",
    id: "deepwiki_orientation",
    risk: "network",
    thinkToolNames: [
      "deepwiki_ask_question",
      "deepwiki_read_contents",
      "deepwiki_read_structure",
    ],
  },
  {
    description:
      "Fetch public HTTP(S) URLs while blocking private and local network targets.",
    id: "public_http_fetch",
    risk: "network",
    thinkToolNames: ["http_fetch"],
  },
  {
    description:
      "Submit the final schema-validated benchmark result. Use this even after exploration, tool, or time budget is exhausted; submit the best calibrated result available rather than stopping without a submission.",
    id: "benchmark_submission",
    risk: "read",
    thinkToolNames: ["submit_benchmark_result"],
  },
] as const satisfies readonly ToolCapability[];

export const THINK_TOOL_CAPABILITY_IDS: Record<string, ToolCapabilityId> =
  Object.fromEntries(
    TOOL_CAPABILITIES.flatMap((capability) =>
      capability.thinkToolNames.map((toolName) => [toolName, capability.id])
    )
  );

export const capabilitiesForThinkToolNames = (
  toolNames: readonly string[]
): ToolCapability[] => {
  const ids = new Set<ToolCapabilityId>();
  for (const toolName of toolNames) {
    const id = THINK_TOOL_CAPABILITY_IDS[toolName];
    if (id) {
      ids.add(id);
    }
  }

  return TOOL_CAPABILITIES.filter((capability) => ids.has(capability.id));
};

export const toolGuideForMode = (mode: BenchmarkToolMode): string => {
  switch (mode) {
    case "none":
      return [
        "No tools are available in this run.",
        "Use the provided task metadata and hints only. Do not claim local code evidence unless it is present in the prompt.",
        "Prefer a conservative result with lower confidence when source-to-sink evidence cannot be inspected.",
      ].join("\n");
    case "local":
      return [
        "Local workspace tools may be available for reading and searching the checked-out repository.",
        "Search before reading, keep outputs bounded, and only cite files that were inspected in this run.",
      ].join("\n");
    case "sandbox":
      return [
        "Remote sandbox tools may be available for command execution and bounded file reads.",
        "Use exec_remote for shell commands, remote_read for targeted files, and keep all commands scoped to the benchmark checkout.",
      ].join("\n");
    default:
      return "";
  }
};
