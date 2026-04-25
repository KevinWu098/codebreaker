import {
  type TieredToolSet,
  ToolTier,
} from "@codebreaker/control-plane/tools/tiers";
import { tool } from "ai";
import { z } from "zod";

const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_REDIRECTS = 5;

const HOSTNAME_BRACKET_REGEX = /^\[(.*)\]$/;
const IPV4_DOTTED_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV4_DECIMAL_REGEX = /^\d+$/;
const IPV4_HEX_REGEX = /^0x[0-9a-f]+$/i;
const IPV4_OCTAL_REGEX = /^0[0-7]+$/;
const IPV4_MAPPED_IPV6_REGEX = /^::ffff:([\d.]+)$/i;
const IPV4_MAPPED_IPV6_HEX_REGEX = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;
const IPV6_LINK_LOCAL_REGEX = /^fe[89ab][0-9a-f]/i;
const IPV6_UNIQUE_LOCAL_REGEX = /^f[cd][0-9a-f]{2}/i;

const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /\.localhost$/i,
  /\.internal$/i,
] as const;

const HttpFetchInputSchema = z.object({
  headers: z.record(z.string(), z.string()).optional(),
  method: z.enum(["GET", "HEAD"]).default("GET"),
  url: z.string().url(),
});

interface FetchHeaders {
  [key: string]: string;
}

export const createHttpTools = (): TieredToolSet => ({
  tiers: {
    http_fetch: ToolTier.Network,
  },
  tools: {
    http_fetch: tool({
      description:
        "Fetch a public HTTP(S) URL with GET or HEAD. Private/local network targets are blocked, including across redirects.",
      execute: async ({ headers, method, url }) => {
        const response = await safeFetch({
          headers,
          initialUrl: url,
          method,
        });
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
      inputSchema: HttpFetchInputSchema,
    }),
  },
});

interface SafeFetchOptions {
  headers?: FetchHeaders | undefined;
  initialUrl: string;
  method: "GET" | "HEAD";
}

const safeFetch = async (options: SafeFetchOptions): Promise<Response> => {
  let currentUrl = options.initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const parsedUrl = assertSafeUrl(currentUrl);
    const init: RequestInit = {
      method: options.method,
      redirect: "manual",
    };

    if (options.headers) {
      init.headers = options.headers;
    }

    const response = await fetch(parsedUrl, init);

    if (!isRedirect(response.status)) {
      return response;
    }

    const location = response.headers.get("location");

    if (!location) {
      return response;
    }

    currentUrl = new URL(location, parsedUrl).toString();
  }

  throw new Error("Too many redirects");
};

const assertSafeUrl = (rawUrl: string): URL => {
  const parsedUrl = new URL(rawUrl);

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are allowed");
  }

  if (isPrivateHost(parsedUrl.hostname)) {
    throw new Error("Private and local network targets are blocked");
  }

  return parsedUrl;
};

const isRedirect = (status: number): boolean =>
  status === 301 ||
  status === 302 ||
  status === 303 ||
  status === 307 ||
  status === 308;

export const isPrivateHost = (rawHostname: string): boolean => {
  const hostname = stripBrackets(rawHostname).toLowerCase();

  if (
    PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname)) ||
    hostname.length === 0
  ) {
    return true;
  }

  if (hostname === "::" || hostname === "::1") {
    return true;
  }

  if (IPV4_DOTTED_REGEX.test(hostname)) {
    return isPrivateIPv4(hostname);
  }

  const ipv4FromInteger = parseIntegerIPv4(hostname);

  if (ipv4FromInteger) {
    return isPrivateIPv4(ipv4FromInteger);
  }

  const ipv4Mapped = hostname.match(IPV4_MAPPED_IPV6_REGEX);

  if (ipv4Mapped?.[1]) {
    return isPrivateIPv4(ipv4Mapped[1]);
  }

  // Colon-hex form of IPv4-mapped IPv6 (e.g. ::ffff:7f00:1 == 127.0.0.1).
  // The dotted regex above doesn't catch this; expand the trailing 32 bits
  // and run them through the IPv4 check.
  const ipv4MappedHex = hostname.match(IPV4_MAPPED_IPV6_HEX_REGEX);

  if (ipv4MappedHex?.[1] && ipv4MappedHex[2]) {
    const high = Number.parseInt(ipv4MappedHex[1], 16);
    const low = Number.parseInt(ipv4MappedHex[2], 16);
    const a = Math.floor(high / 256) % 256;
    const b = high % 256;
    const c = Math.floor(low / 256) % 256;
    const d = low % 256;

    return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
  }

  if (hostname.includes(":")) {
    return isPrivateIPv6(hostname);
  }

  return false;
};

const stripBrackets = (hostname: string): string =>
  hostname.match(HOSTNAME_BRACKET_REGEX)?.[1] ?? hostname;

const parseIntegerIPv4 = (hostname: string): string | null => {
  let value: number | null = null;

  if (IPV4_DECIMAL_REGEX.test(hostname)) {
    value = Number(hostname);
  } else if (IPV4_HEX_REGEX.test(hostname)) {
    value = Number.parseInt(hostname.slice(2), 16);
  } else if (IPV4_OCTAL_REGEX.test(hostname)) {
    value = Number.parseInt(hostname.slice(1), 8);
  }

  if (
    value === null ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 0xff_ff_ff_ff
  ) {
    return null;
  }

  const a = Math.floor(value / 0x1_00_00_00) % 256;
  const b = Math.floor(value / 0x1_00_00) % 256;
  const c = Math.floor(value / 0x1_00) % 256;
  const d = value % 256;

  return `${a}.${b}.${c}.${d}`;
};

const PRIVATE_IPV4_FIRST_OCTETS = new Set([0, 10, 127]);

const isReservedIPv4Pair = (a: number, b: number): boolean => {
  // 100.64.0.0/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  // 169.254.0.0/16 (link-local + cloud metadata)
  if (a === 169 && b === 254) {
    return true;
  }
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  // 192.0.0.0/24, 192.0.2.0/24, 192.88.99.0/24, 192.168.0.0/16
  if (a === 192 && (b === 0 || b === 88 || b === 168)) {
    return true;
  }
  // 198.18.0.0/15 (benchmark), 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && (b === 18 || b === 19 || b === 51)) {
    return true;
  }
  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 113) {
    return true;
  }

  return false;
};

const isPrivateIPv4 = (ip: string): boolean => {
  const parts = ip.split(".").map((part) => Number(part));

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isFinite(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [a, b] = parts;

  if (a === undefined || b === undefined) {
    return true;
  }

  if (PRIVATE_IPV4_FIRST_OCTETS.has(a)) {
    return true;
  }

  if (isReservedIPv4Pair(a, b)) {
    return true;
  }

  // 224.0.0.0/4 (multicast), 240.0.0.0/4 (reserved)
  if (a >= 224) {
    return true;
  }

  return false;
};

const isPrivateIPv6 = (ip: string): boolean => {
  const normalized = ip.replace(/^\[|\]$/g, "");

  // ::1 already handled; loopback in expanded form
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return true;
  }

  // Unspecified
  if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") {
    return true;
  }

  // fe80::/10 link-local — first hextet fe80..febf
  if (IPV6_LINK_LOCAL_REGEX.test(normalized)) {
    return true;
  }

  // fc00::/7 unique-local
  if (IPV6_UNIQUE_LOCAL_REGEX.test(normalized)) {
    return true;
  }

  // ff00::/8 multicast
  if (normalized.startsWith("ff")) {
    return true;
  }

  return false;
};

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
