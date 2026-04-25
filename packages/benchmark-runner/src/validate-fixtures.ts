import { readFile } from "node:fs/promises";
import { join } from "node:path";
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

const EXAMPLE_TASK_PATH = "benchmark/examples/ecvebench-electerm-001.task.json";
const EXAMPLE_L0_INPUT_PATH =
  "benchmark/examples/ecvebench-electerm-001-L0.input.json";
const EXAMPLE_L1_INPUT_PATH =
  "benchmark/examples/ecvebench-electerm-001-L1.input.json";

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
  const l0Input = AgentInputSchema.parse(
    await readJsonFixture(workspaceRoot, EXAMPLE_L0_INPUT_PATH)
  );
  const l1Input = AgentInputSchema.parse(
    await readJsonFixture(workspaceRoot, EXAMPLE_L1_INPUT_PATH)
  );

  AgentInputSchema.parse(renderAgentInput(task, "L0"));
  AgentInputSchema.parse(renderAgentInput(task, "L1"));

  if (
    JSON.stringify(renderAgentInput(task, "L0")) !== JSON.stringify(l0Input)
  ) {
    throw new Error(
      `${EXAMPLE_L0_INPUT_PATH} does not match rendered task input`
    );
  }

  if (
    JSON.stringify(renderAgentInput(task, "L1")) !== JSON.stringify(l1Input)
  ) {
    throw new Error(
      `${EXAMPLE_L1_INPUT_PATH} does not match rendered task input`
    );
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
    task_id: "ecvebench-electerm-001",
    vuln_class: "command-injection",
    vulnerable: true,
  });
};

const main = async (): Promise<void> => {
  const workspaceRoot = join(import.meta.dirname, "../../..");
  const [tasks, metadata] = await Promise.all([
    loadBenchmarkTasks(workspaceRoot),
    loadInternalMetadata(workspaceRoot),
  ]);

  assertBenchmarkMetadataJoin(joinTasksWithInternalMetadata(tasks, metadata));
  await validateFixtureProjection(workspaceRoot);
  validateOutputContract();

  process.stdout.write(
    `Validated ${tasks.length} benchmark task(s), ${metadata.length} internal metadata record(s), and example input/output contracts.\n`
  );
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
