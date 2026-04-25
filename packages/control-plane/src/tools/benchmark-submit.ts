import {
  type AgentOutput,
  AgentOutputSchema,
} from "@codebreaker/benchmark-runner/schemas";
import {
  type TieredToolSet,
  ToolTier,
} from "@codebreaker/control-plane/tools/tiers";
import { tool } from "ai";

export const BENCHMARK_SUBMIT_TOOL_NAME = "submit_benchmark_result" as const;

/**
 * Enforces benchmark JSON shape via the provider tool-calling / schema path.
 * Only expose this in `activeTools` during the submission turn (work turns omit it).
 */
export const createBenchmarkSubmitTool = (
  onRecord: (output: AgentOutput) => void
): TieredToolSet => ({
  tiers: {
    [BENCHMARK_SUBMIT_TOOL_NAME]: ToolTier.Read,
  },
  tools: {
    [BENCHMARK_SUBMIT_TOOL_NAME]: tool({
      description:
        "Submit the final benchmark result. The argument shape is validated against the task contract. Use this when the run is in the submission turn—do not use any other tool on that turn.",
      execute: (input) => {
        const parsed = AgentOutputSchema.parse(input);
        onRecord(parsed);
        return "Benchmark result recorded.";
      },
      inputSchema: AgentOutputSchema,
    }),
  },
});
