import {
  type ArchiveRunRepoInput,
  type CreateRunRepoInput,
  type EnsureStableTargetInput,
  type GitCredential,
  type GitRepoRef,
  type GitTreeStore,
  type MintGitCredentialInput,
  runRepoName,
  stableTargetRepoName,
} from "@codebreaker/control-plane/artifacts/repository";
import type { Env } from "@codebreaker/control-plane/types";

const TRAILING_SLASH_REGEX = /\/$/;

interface ForgejoRepo {
  clone_url?: string;
  default_branch?: string;
  full_name?: string;
  html_url?: string;
  name: string;
}

interface ForgejoError {
  message?: string;
}

export interface ForgejoGitTreeStoreOptions {
  baseUrl: string;
  isOrg: boolean;
  owner: string;
  token: string;
  username?: string;
}

export class ForgejoGitTreeStore implements GitTreeStore {
  private readonly baseUrl: string;
  private readonly isOrg: boolean;
  private readonly owner: string;
  private readonly token: string;
  private readonly username: string;

  constructor(options: ForgejoGitTreeStoreOptions) {
    this.baseUrl = options.baseUrl.replace(TRAILING_SLASH_REGEX, "");
    this.isOrg = options.isOrg;
    this.owner = options.owner;
    this.token = options.token;
    this.username = options.username ?? "git";
  }

  static fromEnv(env: Env): ForgejoGitTreeStore {
    if (!env.FORGEJO_BASE_URL) {
      throw new Error("FORGEJO_BASE_URL is required for Forgejo artifacts");
    }

    if (!env.FORGEJO_TOKEN) {
      throw new Error("FORGEJO_TOKEN is required for Forgejo artifacts");
    }

    const owner = env.FORGEJO_OWNER ?? env.FORGEJO_ORG;

    if (!owner) {
      throw new Error("FORGEJO_OWNER or FORGEJO_ORG is required");
    }

    return new ForgejoGitTreeStore({
      baseUrl: env.FORGEJO_BASE_URL,
      isOrg: Boolean(env.FORGEJO_ORG),
      owner,
      token: env.FORGEJO_TOKEN,
      ...(env.FORGEJO_USERNAME ? { username: env.FORGEJO_USERNAME } : {}),
    });
  }

  async ensureStableTarget(
    input: EnsureStableTargetInput
  ): Promise<GitRepoRef> {
    const name = stableTargetRepoName(input.target);
    const existing = await this.getRepo(name);

    if (existing) {
      return this.toRepoRef(existing, input.target.defaultBranch);
    }

    if (input.target.sourceUrl) {
      const repo = await this.migrateRepo({
        cloneAddress: input.target.sourceUrl,
        defaultBranch: input.target.defaultBranch,
        ...(input.target.description
          ? { description: input.target.description }
          : {}),
        name,
      });

      return this.toRepoRef(repo, input.target.defaultBranch);
    }

    const repo = await this.createRepo({
      defaultBranch: input.target.defaultBranch,
      ...(input.target.description
        ? { description: input.target.description }
        : {}),
      name,
    });

    return this.toRepoRef(repo, input.target.defaultBranch);
  }

  async createRunRepo(input: CreateRunRepoInput): Promise<GitRepoRef> {
    const name = runRepoName(input);
    const existing = await this.getRepo(name);

    if (existing) {
      return this.toRepoRef(existing, input.workingBranch);
    }

    try {
      const repo = await this.migrateRepo({
        cloneAddress: input.sourceRepo.cloneUrl,
        defaultBranch: input.workingBranch,
        description: `Benchmark run ${input.sessionId}`,
        name,
      });

      return this.toRepoRef(repo, input.workingBranch);
    } catch {
      const repo = await this.createRepo({
        defaultBranch: input.workingBranch,
        description: `Benchmark run ${input.sessionId}`,
        name,
      });

      return this.toRepoRef(repo, input.workingBranch);
    }
  }

  mintCredential(_input: MintGitCredentialInput): Promise<GitCredential> {
    return Promise.resolve({
      password: this.token,
      type: "basic",
      username: this.username,
    });
  }

  async archiveRunRepo(input: ArchiveRunRepoInput): Promise<void> {
    await this.request("PATCH", `/repos/${this.owner}/${input.repo.name}`, {
      archived: true,
    });
  }

  private async getRepo(name: string): Promise<ForgejoRepo | null> {
    try {
      return await this.request<ForgejoRepo>(
        "GET",
        `/repos/${this.owner}/${name}`
      );
    } catch (error) {
      if (error instanceof ForgejoApiError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  private createRepo(input: {
    defaultBranch: string;
    description?: string;
    name: string;
  }): Promise<ForgejoRepo> {
    const path = this.isOrg ? `/orgs/${this.owner}/repos` : "/user/repos";

    return this.request<ForgejoRepo>("POST", path, {
      auto_init: true,
      default_branch: input.defaultBranch,
      description: input.description ?? "",
      name: input.name,
      private: true,
    });
  }

  private migrateRepo(input: {
    cloneAddress: string;
    defaultBranch: string;
    description?: string;
    name: string;
  }): Promise<ForgejoRepo> {
    return this.request<ForgejoRepo>("POST", "/repos/migrate", {
      clone_addr: input.cloneAddress,
      default_branch: input.defaultBranch,
      description: input.description ?? "",
      mirror: false,
      private: true,
      repo_name: input.name,
      repo_owner: this.owner,
      service: "git",
    });
  }

  private toRepoRef(repo: ForgejoRepo, fallbackBranch: string): GitRepoRef {
    const cloneUrl = repo.clone_url;

    if (!cloneUrl) {
      throw new Error(`Forgejo repo ${repo.name} did not include clone_url`);
    }

    return {
      cloneUrl,
      defaultBranch: repo.default_branch ?? fallbackBranch,
      fullName: repo.full_name ?? `${this.owner}/${repo.name}`,
      ...(repo.html_url ? { htmlUrl: repo.html_url } : {}),
      name: repo.name,
      provider: "forgejo",
    };
  }

  private async request<T>(
    method: "GET" | "PATCH" | "POST",
    path: string,
    body?: unknown
  ): Promise<T> {
    const init: RequestInit = {
      headers: {
        Authorization: `token ${this.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      method,
    };

    if (body) {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseUrl}/api/v1${path}`, init);

    if (!response.ok) {
      let message = `Forgejo request failed with ${response.status}`;

      try {
        const payload = (await response.json()) as ForgejoError;

        if (payload.message) {
          message = payload.message;
        }
      } catch {
        message = await response.text();
      }

      throw new ForgejoApiError(message, response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}

class ForgejoApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ForgejoApiError";
    this.status = status;
  }
}
