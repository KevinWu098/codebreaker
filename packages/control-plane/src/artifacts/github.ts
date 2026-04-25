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
import { RequestError } from "@octokit/request-error";
import { Octokit, type RestEndpointMethodTypes } from "@octokit/rest";

const TRAILING_SLASH_REGEX = /\/$/;
const REF_CHECK_ATTEMPTS = 5;
const REF_CHECK_DELAY_MS = 1000;
const FORK_IN_PROGRESS_ATTEMPTS = 30;
const FORK_IN_PROGRESS_DELAY_MS = 2000;

type GitHubRepository =
  RestEndpointMethodTypes["repos"]["get"]["response"]["data"];

export interface GitHubGitTreeStoreOptions {
  isOrg: boolean;
  octokit: Octokit;
  owner: string;
  /**
   * PAT or other token; used for HTTPS git over Basic auth in Modal, not for REST (Octokit holds auth).
   */
  token: string;
  /**
   * Username used for HTTPS git operations against `clone_url` (Basic auth).
   * Many setups use `x-access-token` with a PAT; Git also accepts a normal username.
   */
  username: string;
}

export class GitHubGitTreeStore implements GitTreeStore {
  private readonly isOrg: boolean;
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly token: string;
  private readonly username: string;

  constructor(options: GitHubGitTreeStoreOptions) {
    this.isOrg = options.isOrg;
    this.octokit = options.octokit;
    this.owner = options.owner;
    this.token = options.token;
    this.username = options.username;
  }

  static fromEnv(env: Env): GitHubGitTreeStore {
    if (!env.GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN is required for GitHub artifacts");
    }

    if (!(env.GITHUB_ORG || env.GITHUB_OWNER)) {
      throw new Error(
        "Set either GITHUB_ORG (preferred) or GITHUB_OWNER for GitHub artifacts"
      );
    }

    const isOrg = Boolean(env.GITHUB_ORG);
    const owner = env.GITHUB_ORG ?? env.GITHUB_OWNER;

    if (!owner) {
      throw new Error(
        "GITHUB_ORG or GITHUB_OWNER is required for GitHub artifacts"
      );
    }

    const baseUrl = (
      env.GITHUB_API_BASE_URL ?? "https://api.github.com"
    ).replace(TRAILING_SLASH_REGEX, "");
    const apiVersion = env.GITHUB_API_VERSION ?? "2022-11-28";
    const userAgent =
      env.GITHUB_USER_AGENT ?? "codebreaker-control-plane (Octokit)";

    const octokit = GitHubGitTreeStore.createOctokit({
      apiVersion,
      auth: env.GITHUB_TOKEN,
      baseUrl,
      userAgent,
    });

    return new GitHubGitTreeStore({
      isOrg,
      octokit,
      owner,
      token: env.GITHUB_TOKEN,
      username: env.GITHUB_GIT_USERNAME ?? "x-access-token",
    });
  }

  private static createOctokit(options: {
    apiVersion: string;
    auth: string;
    baseUrl: string;
    userAgent: string;
  }): Octokit {
    const octokit = new Octokit({
      auth: options.auth,
      baseUrl: options.baseUrl,
      userAgent: options.userAgent,
    });

    octokit.hook.before("request", (requestOptions) => {
      const { headers } = requestOptions;
      if (!headers || typeof headers !== "object") {
        return;
      }
      Object.assign(headers, {
        "X-GitHub-Api-Version": options.apiVersion,
      });
    });

    return octokit;
  }

  async ensureStableTarget(
    input: EnsureStableTargetInput
  ): Promise<GitRepoRef> {
    const name = stableTargetRepoName(input.target);
    const existing = await this.getRepoByName(name);

    if (existing) {
      await this.ensureTargetRefsPresent(existing, input.target);
      return this.toRepoRef(existing, input.target.defaultBranch);
    }

    if (input.target.sourceUrl) {
      const upstream = this.parseUpstreamRefFromUrlOrThrow(
        input.target.sourceUrl
      );
      const forked = await this.forkIntoOwner({
        ...(input.target.description
          ? { description: input.target.description }
          : {}),
        newRepoName: name,
        privateRepo: true,
        upstream,
      });

      await this.ensureTargetRefsPresent(forked, input.target);
      return this.toRepoRef(forked, input.target.defaultBranch);
    }

    const created = await this.createEmptyRepo({
      defaultBranch: input.target.defaultBranch,
      ...(input.target.description
        ? { description: input.target.description }
        : {}),
      name,
    });

    return this.toRepoRef(created, input.target.defaultBranch);
  }

  async createRunRepo(input: CreateRunRepoInput): Promise<GitRepoRef> {
    const name = runRepoName(input);
    const existing = await this.getRepoByName(name);

    if (existing) {
      return this.toRepoRef(existing, input.workingBranch);
    }

    const upstream = this.parseRepoRefOrThrow(
      input.sourceRepo.fullName,
      input.sourceRepo.cloneUrl
    );
    const forked = await this.forkIntoOwner({
      description: `Benchmark run ${input.sessionId}`,
      newRepoName: name,
      privateRepo: true,
      upstream,
    });

    return this.toRepoRef(forked, input.workingBranch);
  }

  mintCredential(_input: MintGitCredentialInput): Promise<GitCredential> {
    return Promise.resolve({
      password: this.token,
      type: "basic",
      username: this.username,
    });
  }

  async archiveRunRepo(input: ArchiveRunRepoInput): Promise<void> {
    await this.octokit.repos.update({
      archived: true,
      owner: this.owner,
      repo: input.repo.name,
    });
  }

  private matchesErrorMessage(
    error: unknown,
    predicate: (message: string) => boolean
  ): boolean {
    if (!(error instanceof RequestError)) {
      return false;
    }

    if (predicate(error.message)) {
      return true;
    }
    const data = error.response?.data;
    if (data && typeof data === "object" && "message" in data) {
      const m = (data as { message?: unknown }).message;
      if (typeof m === "string" && predicate(m)) {
        return true;
      }
    }
    return false;
  }

  private isRepoNameExistsOnAccountError(error: unknown): boolean {
    return this.matchesErrorMessage(error, (value) =>
      value.toLowerCase().includes("name already exists")
    );
  }

  private isRepoAlreadyBeingForkedError(error: unknown): boolean {
    return this.matchesErrorMessage(error, (value) =>
      value.toLowerCase().includes("already being forked")
    );
  }

  private async getRepoByNameWithRetry(
    name: string,
    options: { attempts: number; delayMs: number } = {
      attempts: REF_CHECK_ATTEMPTS,
      delayMs: REF_CHECK_DELAY_MS,
    }
  ): Promise<GitHubRepository | null> {
    for (let attempt = 0; attempt < options.attempts; attempt += 1) {
      const repo = await this.getRepoByName(name);
      if (repo) {
        return repo;
      }
      if (attempt < options.attempts - 1) {
        await delay(options.delayMs);
      }
    }
    return null;
  }

  private async forkIntoOwner(input: {
    description?: string;
    newRepoName: string;
    privateRepo: boolean;
    upstream: { name: string; owner: string };
  }): Promise<GitHubRepository> {
    try {
      const { data } = await this.octokit.repos.createFork({
        name: input.newRepoName,
        owner: input.upstream.owner,
        private: input.privateRepo,
        repo: input.upstream.name,
        ...(this.isOrg ? { organization: this.owner } : {}),
        ...(input.description ? { description: input.description } : {}),
      });

      return data;
    } catch (error) {
      if (this.isRepoNameExistsOnAccountError(error)) {
        const existing = await this.getRepoByNameWithRetry(input.newRepoName);
        if (existing) {
          return existing;
        }
        throw new Error(
          `GitHub reported the repository name already exists, but could not load ${this.owner}/${input.newRepoName} after retries`,
          { cause: error }
        );
      }
      if (this.isRepoAlreadyBeingForkedError(error)) {
        const existing = await this.getRepoByNameWithRetry(input.newRepoName, {
          attempts: FORK_IN_PROGRESS_ATTEMPTS,
          delayMs: FORK_IN_PROGRESS_DELAY_MS,
        });
        if (existing) {
          return existing;
        }
        throw new Error(
          `GitHub reported ${input.upstream.owner}/${input.upstream.name} is already being forked, but ${this.owner}/${input.newRepoName} did not appear after retries`,
          { cause: error }
        );
      }
      throw error;
    }
  }

  private async ensureTargetRefsPresent(
    repo: GitHubRepository,
    target: EnsureStableTargetInput["target"]
  ): Promise<void> {
    const refs = [target.vulnerableRef, target.patchedRef].filter(
      (ref): ref is string => Boolean(ref)
    );

    for (const ref of refs) {
      await this.waitForCommitRef(repo, ref);
    }
  }

  private async waitForCommitRef(
    repo: GitHubRepository,
    ref: string
  ): Promise<void> {
    const parsed = this.parseRepoRefOrThrow(repo.full_name, repo.clone_url);
    let lastError: unknown;

    for (let attempt = 0; attempt < REF_CHECK_ATTEMPTS; attempt += 1) {
      try {
        await this.octokit.repos.getCommit({
          owner: parsed.owner,
          ref,
          repo: parsed.name,
        });
        return;
      } catch (error) {
        lastError = error;

        if (!(error instanceof RequestError && error.status === 404)) {
          throw error;
        }

        if (attempt < REF_CHECK_ATTEMPTS - 1) {
          await delay(REF_CHECK_DELAY_MS);
        }
      }
    }

    throw new Error(
      `Target repository ${repo.full_name} does not contain required ref ${ref}`,
      { cause: lastError }
    );
  }

  private parseUpstreamRefFromUrlOrThrow(sourceUrl: string): {
    fullName: string;
    name: string;
    owner: string;
  } {
    if (sourceUrl.startsWith("git@github.com:")) {
      const rest = sourceUrl.slice("git@github.com:".length);
      const [owner, repoWithSuffix] = rest.split("/", 2);

      if (!(owner && repoWithSuffix)) {
        throw new Error("Invalid git@github.com sourceUrl");
      }

      const name = repoWithSuffix.endsWith(".git")
        ? repoWithSuffix.slice(0, -".git".length)
        : repoWithSuffix;

      return { fullName: `${owner}/${name}`, name, owner };
    }

    return this.parseRepoRefOrThrow(sourceUrl, sourceUrl);
  }

  private parseRepoRefOrThrow(
    fullName: string,
    cloneOrUrl: string
  ): {
    fullName: string;
    name: string;
    owner: string;
  } {
    const fromOwnerSlashRepo = (value: string) => {
      if (value.includes("://") || value.startsWith("git@")) {
        return null;
      }
      const parts = value.split("/").filter(Boolean);
      if (parts.length !== 2) {
        return null;
      }
      const owner = parts[0];
      const name = parts[1];
      if (!(owner && name)) {
        return null;
      }
      return { fullName: value, name, owner };
    };

    const fromHttpUrl = (value: string) => {
      try {
        const u = new URL(value);
        const parts = u.pathname.split("/").filter(Boolean);
        if (parts.length < 2) {
          return null;
        }
        const owner = parts[0];
        let name = parts[1];
        if (name?.endsWith(".git")) {
          name = name.slice(0, -".git".length);
        }
        if (!(owner && name)) {
          return null;
        }
        return { fullName: `${owner}/${name}`, name, owner };
      } catch {
        return null;
      }
    };

    const parsed =
      fromOwnerSlashRepo(fullName) ??
      fromHttpUrl(fullName) ??
      fromHttpUrl(cloneOrUrl) ??
      fromOwnerSlashRepo(cloneOrUrl);

    if (!parsed) {
      throw new Error(
        `Expected a GitHub repo ref like owner/name or a Git clone URL, got fullName=${fullName} cloneOrUrl=${cloneOrUrl}`
      );
    }

    return parsed;
  }

  private async getRepoByName(name: string): Promise<GitHubRepository | null> {
    try {
      const { data } = await this.octokit.repos.get({
        owner: this.owner,
        repo: name,
      });

      return data;
    } catch (error) {
      if (error instanceof RequestError && error.status === 404) {
        return null;
      }

      throw error;
    }
  }

  private async createEmptyRepo(input: {
    defaultBranch: string;
    description?: string;
    name: string;
    private?: boolean;
  }): Promise<GitHubRepository> {
    const common = {
      auto_init: true,
      default_branch: input.defaultBranch,
      name: input.name,
      private: input.private ?? true,
      ...(input.description ? { description: input.description } : {}),
    } as const;

    if (this.isOrg) {
      const { data } = await this.octokit.repos.createInOrg({
        org: this.owner,
        ...common,
      });
      return data;
    }

    const { data } =
      await this.octokit.repos.createForAuthenticatedUser(common);
    return data;
  }

  private toRepoRef(
    repo: GitHubRepository,
    fallbackBranch: string
  ): GitRepoRef {
    return {
      cloneUrl: repo.clone_url,
      defaultBranch: repo.default_branch ?? fallbackBranch,
      fullName: repo.full_name,
      htmlUrl: repo.html_url,
      name: repo.name,
      provider: "github",
    };
  }
}

const delay = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
