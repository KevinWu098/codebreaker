import type { Env } from "@codebreaker/control-plane/types";
import { base64ToBytes, bytesToBase64 } from "@codebreaker/shared/lib/base64";
import { trimTrailingSlash } from "@codebreaker/shared/lib/utils";
import {
  type ExecResult,
  ExecResultSchema,
  type SandboxProfileName,
} from "@codebreaker/shared/schemas/sandbox";

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 100;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const GIT_REQUEST_TIMEOUT_MS = 300_000;
const AUTH_BASIC_RE = /Authorization:\s*Basic\s+[A-Za-z0-9+/=]+/gi;
const AUTH_BEARER_RE = /Authorization:\s*Bearer\s+[^\s'"`]+/gi;

const redactHttpCredentialsInText = (message: string): string =>
  message
    .replace(AUTH_BASIC_RE, "Authorization: Basic <redacted>")
    .replace(AUTH_BEARER_RE, "Authorization: Bearer <redacted>");

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

interface ShimGitCheckoutResponse {
  commit_sha?: string;
  repo_path: string;
}

interface ShimGitCommitResponse extends ShimGitCheckoutResponse {
  pushed: boolean;
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

export interface GitCredentialOptions {
  password: string;
  type: "basic" | "token-header";
  username: string;
}

export interface GitCheckoutOptions {
  branch: string;
  credential: GitCredentialOptions;
  path?: string | undefined;
  profile?: SandboxProfileName | undefined;
  ref?: string | undefined;
  remoteUrl: string;
  sessionId: string;
}

export interface GitCommitOptions {
  branch: string;
  credential: GitCredentialOptions;
  message: string;
  path: string;
  paths: string[];
  profile?: SandboxProfileName | undefined;
  remoteUrl: string;
  sessionId: string;
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
    this.url = trimTrailingSlash(options.url);
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

  async checkoutGitRepo(options: GitCheckoutOptions): Promise<{
    commitSha?: string;
    repoPath: string;
  }> {
    const result = await this.request<ShimGitCheckoutResponse>(
      "POST",
      "/git/checkout",
      {
        body: toShimGitCheckoutRequest(options),
        idempotencyKey: crypto.randomUUID(),
        timeoutMs: GIT_REQUEST_TIMEOUT_MS,
      }
    );
    const checkout = {
      repoPath: result.repo_path,
      ...(result.commit_sha ? { commitSha: result.commit_sha } : {}),
    };

    return checkout;
  }

  async commitGitRepo(options: GitCommitOptions): Promise<{
    commitSha?: string;
    pushed: boolean;
    repoPath: string;
  }> {
    const result = await this.request<ShimGitCommitResponse>(
      "POST",
      "/git/commit",
      {
        body: toShimGitCommitRequest(options),
        idempotencyKey: crypto.randomUUID(),
        timeoutMs: GIT_REQUEST_TIMEOUT_MS,
      }
    );
    const commit = {
      pushed: result.pushed,
      repoPath: result.repo_path,
      ...(result.commit_sha ? { commitSha: result.commit_sha } : {}),
    };

    return commit;
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
      timeoutMs?: number;
    } = {}
  ): Promise<T> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const init: RequestInit = {
        headers: this.headers(options),
        method,
        signal: controller.signal,
      };

      if (options.body) {
        init.body = JSON.stringify(options.body);
      }

      let response: Response;
      try {
        response = await fetch(`${this.url}${path}`, init);
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = controller.signal.aborted
          ? new Error(
              `Modal shim ${method} ${path} did not respond within ${timeoutMs}ms`
            )
          : error;

        if (attempt === MAX_RETRIES - 1) {
          break;
        }

        await delay(retryDelayMs(null, attempt));
        continue;
      }

      clearTimeout(timeoutId);

      if (response.ok) {
        return response.json() as Promise<T>;
      }

      const body = await response.text();
      lastError = new Error(redactHttpCredentialsInText(body));

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

const toShimGitCheckoutRequest = (options: GitCheckoutOptions) => ({
  branch: options.branch,
  credential: options.credential,
  path: options.path,
  profile: options.profile,
  ref: options.ref,
  remote_url: options.remoteUrl,
  session_id: options.sessionId,
});

const toShimGitCommitRequest = (options: GitCommitOptions) => ({
  branch: options.branch,
  credential: options.credential,
  message: options.message,
  path: options.path,
  paths: options.paths,
  profile: options.profile,
  remote_url: options.remoteUrl,
  session_id: options.sessionId,
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

const retryDelayMs = (response: Response | null, attempt: number): number => {
  const retryAfter = response?.headers.get("Retry-After");

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
