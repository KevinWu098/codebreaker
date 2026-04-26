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
        "Submit a benchmark result object. Call up to 3 times (once per distinct vulnerability hypothesis, strongest first). The argument shape is validated against the task contract. Do not write JSON in an assistant message or use any other tool on the submission turn.",
      execute: (input) => {
        const parsed = AgentOutputSchema.parse(input);
        onRecord(parsed);
        return "Benchmark result recorded.";
      },
      inputSchema: AgentOutputSchema,
    }),
  },
});
