import {
  type TieredToolSet,
  ToolTier,
} from "@codebreaker/control-plane/tools/tiers";
import { tool } from "ai";
import { z } from "zod";

const DEEPWIKI_MCP_URL = "https://mcp.deepwiki.com/mcp";
const MAX_RESULT_CHARS = 64_000;
const LINE_SPLIT_RE = /\r?\n/;

const RepoNameSchema = z
  .string()
  .regex(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
    "Use GitHub owner/repo format, for example facebook/react"
  );

const ReadWikiInputSchema = z.object({
  repoName: RepoNameSchema,
});

const AskQuestionInputSchema = z.object({
  question: z.string().min(1),
  repoName: z.union([RepoNameSchema, z.array(RepoNameSchema).min(1).max(10)]),
});

type DeepWikiToolName =
  | "ask_question"
  | "read_wiki_contents"
  | "read_wiki_structure";

interface JsonRpcResponse {
  error?: {
    code?: number;
    data?: unknown;
    message: string;
  };
  id?: string;
  result?: unknown;
}

interface DeepWikiToolResult {
  content?: Array<{
    text?: string;
    type?: string;
  }>;
  isError?: boolean;
  structuredContent?: {
    result?: string;
  };
}

export const createDeepWikiTools = (): TieredToolSet => ({
  tiers: {
    deepwiki_ask_question: ToolTier.Network,
    deepwiki_read_contents: ToolTier.Network,
    deepwiki_read_structure: ToolTier.Network,
  },
  tools: {
    deepwiki_ask_question: tool({
      description:
        "Ask DeepWiki a question about a public GitHub repository using the DeepWiki MCP server. Best for quick repo orientation and architecture/codebase exploration; verify security findings against local files before finalizing.",
      execute: ({ question, repoName }) =>
        callDeepWikiTool("ask_question", { question, repoName }),
      inputSchema: AskQuestionInputSchema,
    }),
    deepwiki_read_contents: tool({
      description:
        "Read DeepWiki's generated documentation for a public GitHub repository via the DeepWiki MCP server. Use for broad orientation, not as final evidence for benchmark locations.",
      execute: ({ repoName }) =>
        callDeepWikiTool("read_wiki_contents", { repoName }),
      inputSchema: ReadWikiInputSchema,
    }),
    deepwiki_read_structure: tool({
      description:
        "List DeepWiki documentation topics for a public GitHub repository via the DeepWiki MCP server.",
      execute: ({ repoName }) =>
        callDeepWikiTool("read_wiki_structure", { repoName }),
      inputSchema: ReadWikiInputSchema,
    }),
  },
});

export const askDeepWikiQuestion = async (input: {
  question: string;
  repoName: string | string[];
}): Promise<{ result: string; truncated: boolean }> =>
  callDeepWikiTool("ask_question", {
    question: input.question,
    repoName: input.repoName,
  });

const callDeepWikiTool = async (
  name: DeepWikiToolName,
  arguments_: Record<string, unknown>
): Promise<{ result: string; truncated: boolean }> => {
  const response = await fetch(DEEPWIKI_MCP_URL, {
    body: JSON.stringify({
      id: crypto.randomUUID(),
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: arguments_,
        name,
      },
    }),
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(
      `DeepWiki MCP request failed with HTTP ${response.status}: ${await response.text()}`
    );
  }

  const rpcResponse = parseMcpResponse(await response.text());

  if (rpcResponse.error) {
    throw new Error(`DeepWiki MCP error: ${rpcResponse.error.message}`);
  }

  const result = extractToolResult(rpcResponse.result);

  if (result.isError) {
    throw new Error(`DeepWiki tool returned an error: ${resultText(result)}`);
  }

  return capResult(resultText(result));
};

const parseMcpResponse = (body: string): JsonRpcResponse => {
  const trimmedBody = body.trim();

  if (trimmedBody.startsWith("{")) {
    return parseJsonRpcResponse(trimmedBody);
  }

  for (const line of trimmedBody.split(LINE_SPLIT_RE)) {
    if (line.startsWith("data: ")) {
      return parseJsonRpcResponse(line.slice("data: ".length));
    }
  }

  throw new Error("DeepWiki MCP response did not contain a JSON-RPC payload");
};

const parseJsonRpcResponse = (body: string): JsonRpcResponse => {
  const parsed: unknown = JSON.parse(body);

  if (!isRecord(parsed)) {
    throw new Error("DeepWiki MCP response was not an object");
  }

  const response: JsonRpcResponse = {};

  if (typeof parsed.id === "string") {
    response.id = parsed.id;
  }

  if ("result" in parsed) {
    response.result = parsed.result;
  }

  if (isRecord(parsed.error) && typeof parsed.error.message === "string") {
    response.error = {
      message: parsed.error.message,
    };

    if (typeof parsed.error.code === "number") {
      response.error.code = parsed.error.code;
    }

    if ("data" in parsed.error) {
      response.error.data = parsed.error.data;
    }
  }

  return response;
};

const extractToolResult = (value: unknown): DeepWikiToolResult => {
  if (!isRecord(value)) {
    throw new Error("DeepWiki MCP tool result was not an object");
  }

  const result: DeepWikiToolResult = {};

  if (Array.isArray(value.content)) {
    result.content = value.content
      .filter(isRecord)
      .map((item) => ({
        ...(typeof item.text === "string" ? { text: item.text } : {}),
        ...(typeof item.type === "string" ? { type: item.type } : {}),
      }))
      .filter((item) => item.text || item.type);
  }

  if (typeof value.isError === "boolean") {
    result.isError = value.isError;
  }

  if (isRecord(value.structuredContent)) {
    result.structuredContent = {};

    if (typeof value.structuredContent.result === "string") {
      result.structuredContent.result = value.structuredContent.result;
    }
  }

  return result;
};

const resultText = (result: DeepWikiToolResult): string => {
  if (result.structuredContent?.result) {
    return result.structuredContent.result;
  }

  const textContent =
    result.content
      ?.map((item) => item.text)
      .filter((text): text is string => Boolean(text))
      .join("\n\n") ?? "";

  if (!textContent) {
    throw new Error("DeepWiki MCP tool result did not include text content");
  }

  return textContent;
};

const capResult = (result: string): { result: string; truncated: boolean } => {
  if (result.length <= MAX_RESULT_CHARS) {
    return {
      result,
      truncated: false,
    };
  }

  return {
    result: result.slice(0, MAX_RESULT_CHARS),
    truncated: true,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
