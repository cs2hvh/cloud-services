/**
 * GitHub Provider
 * Implements the BaseProvider interface for GitHub
 * This is the main entry point for all GitHub operations
 * 
 * Usage:
 * const github = new GitHubProvider();
 * const repos = await github.getRepositories(token);
 * const branches = await github.getBranches(repo, token);
 */

import {
  BaseProvider,
} from '../base';
import {
  Repository,
  Branch,
  AuthToken,
  RepositoriesResponse,
  BranchesResponse,
  FrameworkDetection,
} from '../types';
import { githubTokenManager } from './token-manager';
import { githubApiClient } from './api-client';

export class GitHubProvider implements BaseProvider {
  name = 'github' as const;

  /**
   * Get GitHub token for user
   */
  async getToken(userId: string): Promise<AuthToken | null> {
    const token = await githubTokenManager.getToken(userId);
    if (!token) {
      return null;
    }

    return {
      accessToken: token,
      tokenType: 'bearer',
      scope: 'repo user:email',
    };
  }

  /**
   * Validate GitHub token
   */
  async validateToken(token: string): Promise<boolean> {
    return await githubTokenManager.validateToken(token);
  }

  /**
   * Refresh GitHub token
   * Note: GitHub OAuth tokens (from Supabase linkIdentity) don't expire
   * This method is a stub to satisfy the BaseProvider interface
   */
  async refreshToken(): Promise<AuthToken | null> {
    // GitHub OAuth tokens don't expire - no refresh needed
    return null;
  }

  /**
   * Store GitHub token
   */
  async storeToken(userId: string, token: AuthToken, meta?: { username?: string; githubUserId?: number }): Promise<boolean> {
    return await githubTokenManager.storeToken(userId, token.accessToken, meta);
  }

  /**
   * Delete GitHub token
   */
  async deleteToken(userId: string): Promise<boolean> {
    return await githubTokenManager.deleteToken(userId);
  }

  /**
   * Get repositories for authenticated user
   */
  async getRepositories(token: AuthToken): Promise<RepositoriesResponse> {
    try {
      const repos = await githubApiClient.getRepositories(token.accessToken);

      return {
        repositories: repos,
      };
    } catch (error: unknown) {
      console.error('[GitHub Provider] Error getting repositories:', error);
      const errorObj = error as { error?: string; needsAuth?: boolean };
      return {
        repositories: [],
        message: errorObj.error || 'Failed to fetch repositories',
        needsAppAuth: errorObj.needsAuth,
      };
    }
  }

  /**
   * Get branches for a repository
   */
  async getBranches(repo: Repository, token: AuthToken): Promise<BranchesResponse> {
    try {
      const branches = await githubApiClient.getBranches(repo.fullName, token.accessToken);

      return {
        branches: branches,
        note: `Loaded ${branches.length} branches`,
      };
    } catch (error: unknown) {
      console.error('[GitHub Provider] Error getting branches:', error);
      const errorObj = error as { error?: string };
      return {
        branches: [],
        message: errorObj.error || 'Failed to fetch branches',
      };
    }
  }

  /**
   * Detect framework from repository
   */
  async detectFramework(
    repo: Repository,
    branch: Branch,
    token: AuthToken
  ): Promise<FrameworkDetection | null> {
    try {
      // Check for package.json (Node.js projects)
      const packageJson = await githubApiClient.getFileContent(
        repo.fullName,
        'package.json',
        branch.name,
        token.accessToken
      );

      if (packageJson) {
        try {
          const pkg = JSON.parse(packageJson);

          // Detect framework from dependencies
          if (pkg.dependencies?.['next']) {
            return {
              framework: 'Next.js',
              buildCommand: 'npm run build',
              outputDir: '.next',
              installCommand: 'npm install',
              description: 'Needs Dockerfile in repo',
            };
          }

          if (pkg.dependencies?.['react']) {
            return {
              framework: 'React',
              buildCommand: 'npm run build',
              outputDir: 'build',
              installCommand: 'npm install',
              description: 'Needs Dockerfile in repo',
            };
          }

          if (pkg.dependencies?.['vue'] || pkg.devDependencies?.['vue']) {
            return {
              framework: 'Vue.js',
              buildCommand: 'npm run build',
              outputDir: 'dist',
              installCommand: 'npm install',
              description: 'Auto-generates Dockerfile (Vite)',
            };
          }

          if (pkg.dependencies?.['express']) {
            return {
              framework: 'express',
              buildCommand: '',
              outputDir: '.',
              installCommand: 'npm ci --only=production',
              description: 'Auto-generates Dockerfile',
            };
          }

          // Default Node.js
          return {
            framework: 'Node.js',
            buildCommand: 'npm run build',
            outputDir: '.',
            installCommand: 'npm install',
            description: 'Needs Dockerfile in repo',
          };
        } catch {
          return null;
        }
      }

      // Check for requirements.txt (Python projects)
      const requirementsTxt = await githubApiClient.getFileContent(
        repo.fullName,
        'requirements.txt',
        branch.name,
        token.accessToken
      );

      if (requirementsTxt) {
        // Check for specific Python frameworks
        if (requirementsTxt.includes('django')) {
          return {
            framework: 'django',
            buildCommand: '',
            outputDir: '.',
            installCommand: 'pip install -r requirements.txt',
            description: 'Auto-generates Dockerfile',
          };
        }

        if (requirementsTxt.includes('flask')) {
          return {
            framework: 'flask',
            buildCommand: '',
            outputDir: '.',
            installCommand: 'pip install -r requirements.txt',
            description: 'Auto-generates Dockerfile',
          };
        }

        if (requirementsTxt.includes('fastapi')) {
          return {
            framework: 'fastapi',
            buildCommand: '',
            outputDir: '.',
            installCommand: 'pip install -r requirements.txt',
            description: 'Auto-generates Dockerfile',
          };
        }

        // Default Python
        return {
          framework: 'python',
          buildCommand: '',
          outputDir: '.',
          installCommand: 'pip install -r requirements.txt',
          description: 'Auto-generates Dockerfile',
        };
      }

      // No framework detected
      return null;
    } catch (error) {
      console.error('[GitHub Provider] Error detecting framework:', error);
      return null;
    }
  }

  /**
   * Get repository ID (for consistency across providers)
   */
  getRepoId(repo: Repository): string {
    return repo.id;
  }

  /**
   * Get full repository name (for consistency across providers)
   */
  getFullRepoName(repo: Repository): string {
    return repo.fullName;
  }
}
