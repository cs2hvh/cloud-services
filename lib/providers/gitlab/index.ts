/**
 * GitLab Provider
 * Implements the BaseProvider interface for GitLab
 * This is the main entry point for all GitLab operations
 * 
 * IMPORTANT: GitLab OAuth tokens expire after 2 hours!
 * The token manager handles automatic refresh using refresh_token.
 */

import { BaseProvider } from '../base';
import {
  Repository,
  Branch,
  AuthToken,
  RepositoriesResponse,
  BranchesResponse,
  FrameworkDetection,
} from '../types';
import { gitlabTokenManager } from './token-manager';
import { gitlabApiClient } from './api-client';

export class GitLabProvider implements BaseProvider {
  name = 'gitlab' as const;

  /**
   * Get GitLab token for user (with automatic refresh)
   */
  async getToken(userId: string): Promise<AuthToken | null> {
    const token = await gitlabTokenManager.getToken(userId);
    if (!token) {
      return null;
    }

    return {
      accessToken: token,
      tokenType: 'bearer',
      scope: 'api read_user',
    };
  }

  /**
   * Validate GitLab token
   */
  async validateToken(token: string): Promise<boolean> {
    return await gitlabTokenManager.validateToken(token);
  }

  /**
   * Refresh GitLab token
   */
  async refreshToken(refreshToken: string): Promise<AuthToken | null> {
    const result = await gitlabTokenManager.refreshToken(refreshToken);
    if (!result.accessToken) return null;

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken || undefined,
      expiresIn: result.expiresIn || undefined,
      tokenType: 'bearer',
      scope: 'api read_user',
    };
  }

  /**
   * Store GitLab token
   */
  async storeToken(userId: string, token: AuthToken): Promise<boolean> {
    // For GitLab, we need additional info - this is a simplified store
    // The callback route handles the full store with user info
    return await gitlabTokenManager.storeToken(
      userId,
      token.accessToken,
      token.refreshToken || null,
      token.expiresIn || 7200,
      'unknown', // username should be fetched separately
      0 // user id should be fetched separately
    );
  }

  /**
   * Delete GitLab token
   */
  async deleteToken(userId: string): Promise<boolean> {
    return await gitlabTokenManager.deleteToken(userId);
  }

  /**
   * Get repositories for authenticated user
   */
  async getRepositories(token: AuthToken): Promise<RepositoriesResponse> {
    try {
      const repos = await gitlabApiClient.getRepositories(token.accessToken);

      const privateCount = repos.filter(r => r.private).length;
      return {
        repositories: repos,
        note: `Loaded ${repos.length} repositories (${privateCount} private)`,
      };
    } catch (error: unknown) {
      console.error('[GitLab Provider] Error getting repositories:', error);
      const errorObj = error as { message?: string };
      return {
        repositories: [],
        message: errorObj.message || 'Failed to fetch repositories',
        needsAppAuth: true,
      };
    }
  }

  /**
   * Get branches for a repository
   */
  async getBranches(repo: Repository, token: AuthToken): Promise<BranchesResponse> {
    try {
      const branches = await gitlabApiClient.getBranches(repo.id, token.accessToken);

      return {
        branches: branches,
        note: `Loaded ${branches.length} branches`,
      };
    } catch (error: unknown) {
      console.error('[GitLab Provider] Error getting branches:', error);
      const errorObj = error as { message?: string };
      return {
        branches: [],
        message: errorObj.message || 'Failed to fetch branches',
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
      const packageJson = await gitlabApiClient.getFileContent(
        repo.id,
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
              description: 'Auto-generates Dockerfile',
            };
          }

          if (pkg.dependencies?.['nuxt']) {
            return {
              framework: 'Nuxt.js',
              buildCommand: 'npm run build',
              outputDir: '.output',
              installCommand: 'npm install',
              description: 'Auto-generates Dockerfile',
            };
          }

          if (pkg.dependencies?.['react']) {
            // Check for Vite
            if (pkg.devDependencies?.['vite'] || pkg.dependencies?.['vite']) {
              return {
                framework: 'Vite-React',
                buildCommand: 'npm run build',
                outputDir: 'dist',
                installCommand: 'npm install',
                description: 'Auto-generates Dockerfile (Vite)',
              };
            }
            return {
              framework: 'React',
              buildCommand: 'npm run build',
              outputDir: 'build',
              installCommand: 'npm install',
              description: 'Needs Dockerfile in repo',
            };
          }

          if (pkg.dependencies?.['vue']) {
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
      const requirementsTxt = await gitlabApiClient.getFileContent(
        repo.id,
        'requirements.txt',
        branch.name,
        token.accessToken
      );

      if (requirementsTxt) {
        // Check for common Python frameworks
        const content = requirementsTxt.toLowerCase();
        if (content.includes('django')) {
          return {
            framework: 'django',
            buildCommand: '',
            outputDir: '.',
            installCommand: 'pip install -r requirements.txt',
            description: 'Auto-generates Dockerfile',
          };
        }
        if (content.includes('flask')) {
          return {
            framework: 'flask',
            buildCommand: '',
            outputDir: '.',
            installCommand: 'pip install -r requirements.txt',
            description: 'Auto-generates Dockerfile',
          };
        }
        if (content.includes('fastapi')) {
          return {
            framework: 'fastapi',
            buildCommand: '',
            outputDir: '.',
            installCommand: 'pip install -r requirements.txt',
            description: 'Auto-generates Dockerfile',
          };
        }

        return {
          framework: 'python',
          buildCommand: '',
          outputDir: '.',
          installCommand: 'pip install -r requirements.txt',
          description: 'Auto-generates Dockerfile',
        };
      }

      // Default to Static
      return {
        framework: 'Static',
        buildCommand: '',
        outputDir: '.',
        installCommand: '',
        description: 'Static files only',
      };
    } catch (error) {
      console.error('[GitLab Provider] Framework detection error:', error);
      return null;
    }
  }

  /**
   * Get repository ID (for GitLab, this is the numeric project ID)
   */
  getRepoId(repo: Repository): string {
    return repo.id;
  }

  /**
   * Get full repository name (path_with_namespace)
   */
  getFullRepoName(repo: Repository): string {
    return repo.fullName;
  }
}

// Export the provider class and singleton
export const gitlabProvider = new GitLabProvider();
export { gitlabTokenManager } from './token-manager';
export { gitlabApiClient } from './api-client';
