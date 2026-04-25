import tasksJsonl from "../../../../benchmark/data/tasks.jsonl?raw";
import metadataJsonl from "../../../../benchmark/internal/metadata.jsonl?raw";

export const benchmarkDatasetFixtures = {
  metadataJsonl,
  tasksJsonl,
} as const;
