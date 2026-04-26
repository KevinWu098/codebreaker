import {
  type DirectModelEnv,
  selectDirectModel,
} from "@codebreaker/benchmark-runner/agent-core/model";
import { parseAgentOutputs } from "@codebreaker/benchmark-runner/agent-core/output";
import {
  type BenchmarkPromptPackName,
  buildBenchmarkAgentPrompt,
} from "@codebreaker/benchmark-runner/agent-core/prompts";
import {
  type BenchmarkToolMode,
  BenchmarkToolModeSchema,
} from "@codebreaker/benchmark-runner/agent-core/tools";
import {
  type AgentOutput,
  type BenchmarkRunModel,
  BenchmarkRunModelSchema,
  type BenchmarkRunScore,
  type Difficulty,
  scoreBestCandidate,
  type TaskInstance,
} from "@codebreaker/benchmark-runner/schemas";
import { generateText } from "ai";

export interface DirectBenchmarkRunInput {
  artifactOwner?: string;
  difficulty: Difficulty;
  env?: DirectModelEnv;
  model: BenchmarkRunModel;
  promptPack?: BenchmarkPromptPackName;
  task: TaskInstance;
  toolMode?: BenchmarkToolMode;
}

export interface DirectBenchmarkRunResult {
  best: {
    output: AgentOutput;
    score: BenchmarkRunScore;
  };
  candidates: AgentOutput[];
  finalRawOutput: string;
  model: BenchmarkRunModel;
  promptPack: BenchmarkPromptPackName;
  toolMode: BenchmarkToolMode;
  usage: unknown;
}

export const runDirectBenchmark = async (
  input: DirectBenchmarkRunInput
): Promise<DirectBenchmarkRunResult> => {
  const toolMode = BenchmarkToolModeSchema.parse(input.toolMode ?? "none");

  if (toolMode !== "none") {
    throw new Error(
      "Direct benchmark runs currently support --tools none. Tool-enabled direct adapters can be added on top of the shared capability manifest."
    );
  }

  const model = BenchmarkRunModelSchema.parse(input.model);
  const prompt = buildBenchmarkAgentPrompt({
    ...(input.artifactOwner ? { artifactOwner: input.artifactOwner } : {}),
    difficulty: input.difficulty,
    environment: "direct",
    ...(input.promptPack ? { promptPack: input.promptPack } : {}),
    task: input.task,
    toolMode,
  });
  const result = await generateText({
    model: selectDirectModel(model, input.env ?? process.env),
    prompt: prompt.initialPrompt,
    system: prompt.systemPrompt,
  });
  const candidates = parseAgentOutputs(result.text);
  const best = scoreBestCandidate(input.task, candidates);

  return {
    best,
    candidates,
    finalRawOutput: result.text,
    model,
    promptPack: prompt.promptPack,
    toolMode,
    usage: result.usage,
  };
};
