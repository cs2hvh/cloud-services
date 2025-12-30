/**
 * Base Provider Interface
 * All git providers (GitHub, GitLab, Bitbucket) implement these methods
 * This ensures consistent API across all providers
 */

import {
  Repository,
  Branch,
  AuthToken,
  RepositoriesResponse,
  BranchesResponse,
  FrameworkDetection,
  GitProvider,
} from './types';

export interface BaseProvider {
  // Provider name
  name: GitProvider;

  // Token management
  getToken(userId: string): Promise<AuthToken | null>;
  validateToken(token: string): Promise<boolean>;
  refreshToken(refreshToken: string): Promise<AuthToken | null>;
  storeToken(userId: string, token: AuthToken): Promise<boolean>;
  deleteToken(userId: string): Promise<boolean>;

  // Repository operations
  getRepositories(token: AuthToken): Promise<RepositoriesResponse>;
  getBranches(repo: Repository, token: AuthToken): Promise<BranchesResponse>;

  // Framework detection
  detectFramework(
    repo: Repository,
    branch: Branch,
    token: AuthToken
  ): Promise<FrameworkDetection | null>;

  // Helper methods
  getRepoId(repo: Repository): string;
  getFullRepoName(repo: Repository): string;
}

/**
 * Provider Factory - Creates instances of specific providers
 * Usage: const github = createProvider('github');
 */
export function createProvider(provider: GitProvider): BaseProvider {
  if (provider === 'github') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GitHubProvider } = require('./github/index');
    return new GitHubProvider();
  } else if (provider === 'gitlab') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GitLabProvider } = require('./gitlab/index');
    return new GitLabProvider();
  } else if (provider === 'bitbucket') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BitbucketProvider } = require('./bitbucket/index');
    return new BitbucketProvider();
  }
  throw new Error(`Unknown provider: ${provider}`);
}
