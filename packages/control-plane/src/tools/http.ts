import {
  type TieredToolSet,
  ToolTier,
} from "@codebreaker/control-plane/tools/tiers";
import { tool } from "ai";
import { z } from "zod";

const MAX_RESPONSE_BYTES = 64 * 1024;
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^\[?::1\]?$/i,
  /\.local$/i,
] as const;

const HttpFetchInputSchema = z.object({
  headers: z.record(z.string(), z.string()).optional(),
  method: z.enum(["GET", "HEAD"]).default("GET"),
  url: z.string().url(),
});

export const createHttpTools = (): TieredToolSet => ({
  tiers: {
    http_fetch: ToolTier.Network,
  },
  tools: {
    http_fetch: tool({
      description:
        "Fetch a public HTTP(S) URL with GET or HEAD. Private/local network targets are blocked.",
      inputSchema: HttpFetchInputSchema,
      execute: async ({ headers, method, url }) => {
        const parsedUrl = new URL(url);

        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          throw new Error("Only HTTP and HTTPS URLs are allowed");
        }

        if (isPrivateHost(parsedUrl.hostname)) {
          throw new Error("Private and local network targets are blocked");
        }

        const init: RequestInit = {
          method,
          redirect: "follow",
        };

        if (headers) {
          init.headers = headers;
        }

        const response = await fetch(parsedUrl, init);
        const contentType = response.headers.get("content-type") ?? "";
        const body = method === "HEAD" ? "" : await readCappedText(response);

        return {
          body,
          contentType,
          finalUrl: response.url,
          ok: response.ok,
          status: response.status,
          truncated: body.length >= MAX_RESPONSE_BYTES,
        };
      },
    }),
  },
});

const isPrivateHost = (hostname: string): boolean =>
  PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));

const readCappedText = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader();

  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (totalBytes < MAX_RESPONSE_BYTES) {
    const { done, value } = await reader.read();

    if (done || !value) {
      break;
    }

    const remainingBytes = MAX_RESPONSE_BYTES - totalBytes;
    const chunk =
      value.byteLength > remainingBytes
        ? value.slice(0, remainingBytes)
        : value;

    chunks.push(chunk);
    totalBytes += chunk.byteLength;
  }

  await reader.cancel().catch(() => undefined);

  return new TextDecoder().decode(concatBytes(chunks, totalBytes));
};

const concatBytes = (chunks: Uint8Array[], totalBytes: number): Uint8Array => {
  const output = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
};
