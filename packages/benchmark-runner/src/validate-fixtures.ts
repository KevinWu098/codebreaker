import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseAgentOutputs } from "@codebreaker/benchmark-runner/agent-core/output";
import { buildBenchmarkAgentPrompt } from "@codebreaker/benchmark-runner/agent-core/prompts";
import {
  THINK_TOOL_CAPABILITY_IDS,
  TOOL_CAPABILITIES,
  ToolCapabilityIdSchema,
} from "@codebreaker/benchmark-runner/agent-core/tools";
import {
  assertBenchmarkMetadataJoin,
  joinTasksWithInternalMetadata,
  loadBenchmarkTasks,
  loadInternalMetadata,
} from "@codebreaker/benchmark-runner/loaders";
import {
  AgentInputSchema,
  AgentOutputSchema,
  renderAgentInput,
  TaskInstanceSchema,
} from "@codebreaker/benchmark-runner/schemas";

const EXAMPLE_TASK_PATH =
  "benchmark/examples/ecvebench-filebrowser-001.task.json";
const EXAMPLE_L0_INPUT_PATH =
  "benchmark/examples/ecvebench-filebrowser-001-L0.input.json";
const EXAMPLE_L1_INPUT_PATH =
  "benchmark/examples/ecvebench-filebrowser-001-L1.input.json";
const EXAMPLE_L2_INPUT_PATH =
  "benchmark/examples/ecvebench-filebrowser-001-L2.input.json";
const EXAMPLE_L3_INPUT_PATH =
  "benchmark/examples/ecvebench-filebrowser-001-L3.input.json";

const readJsonFixture = async (
  workspaceRoot: string,
  relativePath: string
): Promise<unknown> => {
  const contents = await readFile(join(workspaceRoot, relativePath), "utf8");
  return JSON.parse(contents) as unknown;
};

const validateFixtureProjection = async (
  workspaceRoot: string
): Promise<void> => {
  const task = TaskInstanceSchema.parse(
    await readJsonFixture(workspaceRoot, EXAMPLE_TASK_PATH)
  );

  const exampleInputs: Array<{
    difficulty: "L0" | "L1" | "L2" | "L3";
    path: string;
  }> = [
    { difficulty: "L0", path: EXAMPLE_L0_INPUT_PATH },
    { difficulty: "L1", path: EXAMPLE_L1_INPUT_PATH },
    { difficulty: "L2", path: EXAMPLE_L2_INPUT_PATH },
    { difficulty: "L3", path: EXAMPLE_L3_INPUT_PATH },
  ];

  for (const { difficulty, path } of exampleInputs) {
    const exampleInput = AgentInputSchema.parse(
      await readJsonFixture(workspaceRoot, path)
    );
    const rendered = renderAgentInput(task, difficulty);
    AgentInputSchema.parse(rendered);

    if (JSON.stringify(rendered) !== JSON.stringify(exampleInput)) {
      throw new Error(`${path} does not match rendered task input`);
    }
  }
};

const validateOutputContract = (): void => {
  AgentOutputSchema.parse({
    confidence: 1,
    difficulty: "L1",
    locations: [
      {
        file: "npm/install.js",
        function: "runLinux",
      },
    ],
    reason:
      "The runLinux() function appends attacker-controlled strings into a shell command.",
    task_id: "ecvebench-filebrowser-001",
    vuln_class: "command-injection",
    vulnerable: true,
  });
};

const validateAgentCorePrompt = async (
  workspaceRoot: string
): Promise<void> => {
  const task = TaskInstanceSchema.parse(
    await readJsonFixture(workspaceRoot, EXAMPLE_TASK_PATH)
  );
  const prompt = buildBenchmarkAgentPrompt({
    difficulty: "L1",
    environment: "direct",
    task,
    toolMode: "none",
  });
  AgentInputSchema.parse(renderAgentInput(task, "L1"));

  const rendered = `${prompt.systemPrompt}\n${prompt.initialPrompt}`;
  const forbiddenGroundTruth = [
    task.ground_truth.reason,
    ...task.ground_truth.locations.map((location) => location.file),
  ];

  for (const forbidden of forbiddenGroundTruth) {
    if (forbidden && rendered.includes(forbidden)) {
      throw new Error("Agent prompt leaked ground-truth benchmark data");
    }
  }

  if (!rendered.includes('"difficulty": "L1"')) {
    throw new Error("Agent prompt did not include rendered difficulty input");
  }

  if (!rendered.includes("No tools are available in this run.")) {
    throw new Error("Direct no-tool prompt did not include tool-mode guidance");
  }

  if (rendered.includes("git ls-files")) {
    throw new Error("Agent prompt includes prohibited git command guidance");
  }

  if (!rendered.includes("Git commands are prohibited")) {
    throw new Error("Agent prompt did not include git prohibition guidance");
  }
};

const validateToolCapabilityManifest = (): void => {
  const capabilityIds = new Set(
    TOOL_CAPABILITIES.map((capability) =>
      ToolCapabilityIdSchema.parse(capability.id)
    )
  );

  for (const [toolName, capabilityId] of Object.entries(
    THINK_TOOL_CAPABILITY_IDS
  )) {
    if (!capabilityIds.has(capabilityId)) {
      throw new Error(`${toolName} maps to unknown capability ${capabilityId}`);
    }
  }

  if (!THINK_TOOL_CAPABILITY_IDS.submit_benchmark_result) {
    throw new Error("submit_benchmark_result is missing from tool manifest");
  }
};

const validateAgentOutputParsing = (): void => {
  const raw = [
    "reasoning text",
    '{"task_id":"ecvebench-filebrowser-001","difficulty":"L1","vulnerable":true,"vuln_class":"command-injection","locations":[{"file":"npm/install.js","function":"runLinux"}],"reason":"source reaches shell sink","confidence":0.8}',
  ].join("\n");
  const outputs = parseAgentOutputs(raw);

  if (outputs.length !== 1) {
    throw new Error("Agent output parser did not extract one candidate");
  }
};

const main = async (): Promise<void> => {
  const workspaceRoot = join(import.meta.dirname, "../../..");
  const [tasks, metadata] = await Promise.all([
    loadBenchmarkTasks(workspaceRoot),
    loadInternalMetadata(workspaceRoot),
  ]);

  assertBenchmarkMetadataJoin(joinTasksWithInternalMetadata(tasks, metadata));
  await validateFixtureProjection(workspaceRoot);
  await validateAgentCorePrompt(workspaceRoot);
  validateToolCapabilityManifest();
  validateOutputContract();
  validateAgentOutputParsing();

  process.stdout.write(
    `Validated ${tasks.length} benchmark task(s), ${metadata.length} internal metadata record(s), agent prompt/tool contracts, and example input/output contracts.\n`
  );
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
