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
    const { GitHubProvider } = require('./github/index');
    return new GitHubProvider();
  } else if (provider === 'gitlab') {
    throw new Error('GitLab provider not yet refactored to modular structure');
  } else if (provider === 'bitbucket') {
    throw new Error('Bitbucket provider not yet refactored to modular structure');
  }
  throw new Error(`Unknown provider: ${provider}`);
}
