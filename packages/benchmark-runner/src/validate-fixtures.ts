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
