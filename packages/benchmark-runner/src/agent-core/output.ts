import {
  type AgentOutput,
  AgentOutputSchema,
} from "@codebreaker/benchmark-runner/schemas";

const MAX_CANDIDATES = 3;

/**
 * Extract up to three valid AgentOutput JSON objects from raw assistant text.
 * Each object is independently validated so the scanner can recover from
 * reasoning traces, markdown wrappers, or malformed runner-up candidates.
 */
export const parseAgentOutputs = (rawOutput: string): AgentOutput[] => {
  const jsonStrings = extractJsonObjects(rawOutput);

  const outputs: AgentOutput[] = [];
  for (const json of jsonStrings) {
    if (outputs.length >= MAX_CANDIDATES) {
      break;
    }
    try {
      const parsed = JSON.parse(json) as unknown;
      outputs.push(AgentOutputSchema.parse(parsed));
    } catch {
      // Skip malformed candidates and continue scanning for later valid JSON.
    }
  }

  if (outputs.length === 0) {
    throw new Error("Agent did not return a valid JSON benchmark result");
  }

  return outputs;
};

const skipJsonString = (value: string, i: number): number => {
  let pos = i + 1;
  while (pos < value.length) {
    if (value[pos] === "\\" && pos + 1 < value.length) {
      pos += 2;
    } else if (value[pos] === '"') {
      return pos + 1;
    } else {
      pos++;
    }
  }
  return pos;
};

const looksLikeJsonObjectStart = (
  value: string,
  openBraceIdx: number
): boolean => {
  for (let j = openBraceIdx + 1; j < value.length; j++) {
    const c = value[j];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      continue;
    }
    return c === '"' || c === "}";
  }
  return false;
};

const findMatchingBrace = (value: string, openIdx: number): number => {
  let depth = 0;
  for (let i = openIdx; i < value.length; i++) {
    const ch = value[i];
    if (ch === '"' && depth > 0) {
      i = skipJsonString(value, i) - 1;
      continue;
    }
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
};

export const extractJsonObjects = (value: string): string[] => {
  const results: string[] = [];
  let searchFrom = 0;

  while (searchFrom < value.length) {
    let start = -1;
    for (let i = searchFrom; i < value.length; i++) {
      if (value[i] === "{" && looksLikeJsonObjectStart(value, i)) {
        start = i;
        break;
      }
    }
    if (start === -1) {
      break;
    }

    const end = findMatchingBrace(value, start);
    if (end === -1) {
      searchFrom = start + 1;
      continue;
    }

    const candidate = value.slice(start, end + 1);
    try {
      JSON.parse(candidate);
      results.push(candidate);
      searchFrom = end + 1;
    } catch {
      searchFrom = start + 1;
    }
  }

  return results;
};
