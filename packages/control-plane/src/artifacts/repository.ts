import { ForgejoGitTreeStore } from "@codebreaker/control-plane/artifacts/forgejo";
import type { Env } from "@codebreaker/control-plane/types";
import type {
  ArtifactCredentialScope,
  BenchmarkTargetConfig,
  GitTreeProvider,
} from "@codebreaker/shared/schemas/artifacts";

const UNSAFE_REPO_NAME_REGEX = /[^a-zA-Z0-9._-]+/g;
const REPO_NAME_EDGE_REGEX = /^[._-]+|[._-]+$/g;

export interface GitRepoRef {
  cloneUrl: string;
  defaultBranch: string;
  fullName: string;
  htmlUrl?: string;
  name: string;
  provider: GitTreeProvider;
}

export interface GitCredential {
  password: string;
  type: "basic" | "token-header";
  username: string;
}

export interface EnsureStableTargetInput {
  target: BenchmarkTargetConfig;
}

export interface CreateRunRepoInput {
  agentId?: string;
  benchmarkId: string;
  runRepoName?: string;
  sessionId: string;
  sourceRepo: GitRepoRef;
  workingBranch: string;
}

export interface MintGitCredentialInput {
  repo: GitRepoRef;
  scope: ArtifactCredentialScope;
}

export interface ArchiveRunRepoInput {
  repo: GitRepoRef;
}

export interface GitTreeStore {
  archiveRunRepo(input: ArchiveRunRepoInput): Promise<void>;
  createRunRepo(input: CreateRunRepoInput): Promise<GitRepoRef>;
  ensureStableTarget(input: EnsureStableTargetInput): Promise<GitRepoRef>;
  mintCredential(input: MintGitCredentialInput): Promise<GitCredential>;
}

export const createGitTreeStore = (env: Env): GitTreeStore => {
  const provider = env.GIT_TREE_PROVIDER ?? "forgejo";

  switch (provider) {
    case "forgejo":
      return ForgejoGitTreeStore.fromEnv(env);
    default:
      throw new Error(`Unsupported git tree provider: ${provider}`);
  }
};

export const stableTargetRepoName = (target: BenchmarkTargetConfig): string =>
  sanitizeRepoName(target.targetRepoName ?? `target-${target.benchmarkId}`);

export const runRepoName = (input: {
  agentId?: string;
  benchmarkId: string;
  runRepoName?: string;
  sessionId: string;
}): string => {
  if (input.runRepoName) {
    return sanitizeRepoName(input.runRepoName);
  }

  const agentSegment = input.agentId ? `-${input.agentId}` : "";

  return sanitizeRepoName(
    `run-${input.benchmarkId}-${input.sessionId}${agentSegment}`
  );
};

export const sanitizeRepoName = (value: string): string => {
  const sanitized = value
    .trim()
    .replaceAll(UNSAFE_REPO_NAME_REGEX, "-")
    .replace(REPO_NAME_EDGE_REGEX, "")
    .toLowerCase();

  if (!sanitized) {
    throw new Error("Repository name is empty after sanitization");
  }

  return sanitized.slice(0, 100);
};
