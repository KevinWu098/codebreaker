import type { Env } from "@codebreaker/control-plane/types";
import { base64ToBytes, bytesToBase64 } from "@codebreaker/shared/lib/base64";
import {
  type ExecResult,
  ExecResultSchema,
  type SandboxProfileName,
} from "@codebreaker/shared/schemas/sandbox";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 100;
const TRAILING_SLASH_REGEX = /\/$/;

interface ShimExecResult {
  command: string;
  duration_ms: number;
  exit_code: number;
  stderr: string;
  stderr_truncated?: boolean;
  stdout: string;
  stdout_truncated?: boolean;
  timed_out?: boolean;
}

interface ShimReadResponse {
  content_base64: string;
  path: string;
}

interface ShimWriteResponse {
  bytes_written: number;
  path: string;
}

export interface ModalExecutorOptions {
  secret: string;
  url: string;
}

export interface ExecRemoteOptions {
  command: string;
  cwd?: string | undefined;
  profile?: SandboxProfileName | undefined;
  sessionId: string;
  timeoutSeconds?: number | undefined;
}

export interface SandboxMetadata {
  created_at: number;
  image_fingerprint: string;
  profile: SandboxProfileName;
  sandbox_id: string;
  session_id: string;
  snapshot_id?: string | null;
}

export class ModalExecutor {
  private readonly secret: string;
  private readonly url: string;

  constructor(options: ModalExecutorOptions) {
    this.secret = options.secret;
    this.url = options.url.replace(TRAILING_SLASH_REGEX, "");
  }

  static fromEnv(env: Env): ModalExecutor {
    return new ModalExecutor({
      secret: env.MODAL_SHIM_SECRET,
      url: env.MODAL_SHIM_URL,
    });
  }

  health(): Promise<unknown> {
    return this.request("GET", "/health", { auth: false });
  }

  listSandboxes(): Promise<SandboxMetadata[]> {
    return this.request<SandboxMetadata[]>("GET", "/sandboxes");
  }

  getSandbox(sessionId: string): Promise<SandboxMetadata | null> {
    return this.request<SandboxMetadata | null>(
      "GET",
      `/sandboxes/${encodeURIComponent(sessionId)}`
    );
  }

  async exec(options: ExecRemoteOptions): Promise<ExecResult> {
    const result = await this.request<ShimExecResult>("POST", "/exec", {
      body: toShimExecRequest(options),
      idempotencyKey: crypto.randomUUID(),
    });

    return fromShimExecResult(result);
  }

  async readFile(input: {
    path: string;
    profile?: SandboxProfileName;
    sessionId: string;
  }): Promise<Uint8Array> {
    const result = await this.request<ShimReadResponse>("POST", "/read", {
      body: {
        path: input.path,
        profile: input.profile,
        session_id: input.sessionId,
      },
      idempotencyKey: crypto.randomUUID(),
    });

    return base64ToBytes(result.content_base64);
  }

  writeFile(input: {
    content: Uint8Array;
    path: string;
    profile?: SandboxProfileName;
    sessionId: string;
  }): Promise<ShimWriteResponse> {
    return this.request<ShimWriteResponse>("POST", "/write", {
      body: {
        content_base64: bytesToBase64(input.content),
        path: input.path,
        profile: input.profile,
        session_id: input.sessionId,
      },
      idempotencyKey: crypto.randomUUID(),
    });
  }

  async terminate(sessionId: string): Promise<void> {
    await this.request("POST", "/terminate", {
      body: {
        session_id: sessionId,
      },
      idempotencyKey: crypto.randomUUID(),
    }).catch(() => undefined);
  }

  private async request<T = unknown>(
    method: "GET" | "POST",
    path: string,
    options: {
      auth?: boolean;
      body?: unknown;
      idempotencyKey?: string;
    } = {}
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const init: RequestInit = {
        headers: this.headers(options),
        method,
      };

      if (options.body) {
        init.body = JSON.stringify(options.body);
      }

      const response = await fetch(`${this.url}${path}`, init);

      if (response.ok) {
        return response.json() as Promise<T>;
      }

      lastError = new Error(await response.text());

      if (!shouldRetry(response.status) || attempt === MAX_RETRIES - 1) {
        break;
      }

      await delay(retryDelayMs(response, attempt));
    }

    throw lastError;
  }

  private headers(options: {
    auth?: boolean;
    body?: unknown;
    idempotencyKey?: string;
  }): Headers {
    const headers = new Headers();

    if (options.body) {
      headers.set("Content-Type", "application/json");
    }

    if (options.auth !== false) {
      headers.set("X-Shim-Secret", this.secret);
    }

    if (options.idempotencyKey) {
      headers.set("X-Idempotency-Key", options.idempotencyKey);
    }

    return headers;
  }
}

const toShimExecRequest = (options: ExecRemoteOptions) => ({
  command: options.command,
  cwd: options.cwd,
  profile: options.profile,
  session_id: options.sessionId,
  timeout_seconds: options.timeoutSeconds,
});

const fromShimExecResult = (result: ShimExecResult): ExecResult =>
  ExecResultSchema.parse({
    command: result.command,
    durationMs: result.duration_ms,
    exitCode: result.exit_code,
    stderr: result.stderr,
    stderrTruncated: result.stderr_truncated ?? false,
    stdout: result.stdout,
    stdoutTruncated: result.stdout_truncated ?? false,
    timedOut: result.timed_out ?? false,
  });

const shouldRetry = (status: number): boolean =>
  status === 408 || status === 409 || status === 429 || status >= 500;

const retryDelayMs = (response: Response, attempt: number): number => {
  const retryAfter = response.headers.get("Retry-After");

  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds)) {
      return seconds * 1000;
    }
  }

  return RETRY_BASE_MS * 2 ** attempt;
};

const delay = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
