import {
  type TieredToolSet,
  ToolTier,
} from "@codebreaker/control-plane/tools/tiers";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { tool } from "ai";
import { z } from "zod";

const DEEPWIKI_MCP_URL = "https://mcp.deepwiki.com/mcp";
const MAX_RESULT_CHARS = 64_000;

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

const createMcpClient = async (): Promise<Client> => {
  const transport = new StreamableHTTPClientTransport(
    new URL(DEEPWIKI_MCP_URL)
  );
  const client = new Client({ name: "codebreaker", version: "1.0.0" });
  // Type assertion needed: SDK's StreamableHTTPClientTransport.sessionId is
  // `string | undefined` but Transport expects `string` under exactOptionalPropertyTypes.
  await client.connect(transport as Parameters<typeof client.connect>[0]);
  return client;
};

const callDeepWikiTool = async (
  name: DeepWikiToolName,
  arguments_: Record<string, unknown>
): Promise<{ result: string; truncated: boolean }> => {
  const client = await createMcpClient();

  try {
    const response = await client.callTool({ arguments: arguments_, name });

    if (response.isError) {
      throw new Error(
        `DeepWiki tool returned an error: ${extractText(response)}`
      );
    }

    return capResult(extractText(response));
  } finally {
    await client.close();
  }
};

const extractText = (
  response: Awaited<ReturnType<Client["callTool"]>>
): string => {
  if (
    response.structuredContent &&
    typeof response.structuredContent === "object" &&
    "result" in response.structuredContent &&
    typeof response.structuredContent.result === "string"
  ) {
    return response.structuredContent.result;
  }

  const textContent = Array.isArray(response.content)
    ? response.content
        .filter(
          (item): item is { text: string; type: string } =>
            typeof item === "object" &&
            item !== null &&
            "type" in item &&
            item.type === "text" &&
            "text" in item &&
            typeof item.text === "string"
        )
        .map((item) => item.text)
        .join("\n\n")
    : "";

  if (!textContent) {
    throw new Error("DeepWiki MCP tool result did not include text content");
  }

  return textContent;
};

const capResult = (result: string): { result: string; truncated: boolean } => {
  if (result.length <= MAX_RESULT_CHARS) {
    return { result, truncated: false };
  }

  return { result: result.slice(0, MAX_RESULT_CHARS), truncated: true };
};
