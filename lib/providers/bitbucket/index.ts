/**
 * Bitbucket Provider
 * Implements the BaseProvider interface for Bitbucket
 * This is the main entry point for all Bitbucket operations
 * 
 * IMPORTANT: Bitbucket OAuth tokens expire after 1-2 hours!
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
import { bitbucketTokenManager } from './token-manager';
import { bitbucketApiClient } from './api-client';

export class BitbucketProvider implements BaseProvider {
  name = 'bitbucket' as const;

  /**
   * Get Bitbucket token for user (with automatic refresh)
   */
  async getToken(userId: string): Promise<AuthToken | null> {
    const token = await bitbucketTokenManager.getToken(userId);
    if (!token) {
      return null;
    }

    return {
      accessToken: token,
      tokenType: 'bearer',
      scope: 'repository account',
    };
  }

  /**
   * Validate Bitbucket token
   */
  async validateToken(token: string): Promise<boolean> {
    return await bitbucketTokenManager.validateToken(token);
  }

  /**
   * Refresh Bitbucket token
   */
  async refreshToken(refreshToken: string): Promise<AuthToken | null> {
    const result = await bitbucketTokenManager.refreshToken(refreshToken);
    if (!result.accessToken) return null;

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken || undefined,
      expiresIn: result.expiresIn || undefined,
      tokenType: 'bearer',
      scope: 'repository account',
    };
  }

  /**
   * Store Bitbucket token
   */
  async storeToken(userId: string, token: AuthToken): Promise<boolean> {
    return await bitbucketTokenManager.storeToken(
      userId,
      token.accessToken,
      token.refreshToken || null,
      token.expiresIn || 3600,
      'unknown',
      'unknown'
    );
  }

  /**
   * Delete Bitbucket token
   */
  async deleteToken(userId: string): Promise<boolean> {
    return await bitbucketTokenManager.deleteToken(userId);
  }

  /**
   * Get repositories for authenticated user
   */
  async getRepositories(token: AuthToken): Promise<RepositoriesResponse> {
    try {
      const repos = await bitbucketApiClient.getRepositories(token.accessToken);

      const privateCount = repos.filter(r => r.private).length;
      return {
        repositories: repos,
        note: `Loaded ${repos.length} repositories (${privateCount} private)`,
      };
    } catch (error: unknown) {
      console.error('[Bitbucket Provider] Error getting repositories:', error);
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
      const branches = await bitbucketApiClient.getBranches(repo.fullName, token.accessToken);

      return {
        branches: branches,
        note: `Loaded ${branches.length} branches`,
      };
    } catch (error: unknown) {
      console.error('[Bitbucket Provider] Error getting branches:', error);
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
      const packageJson = await bitbucketApiClient.getFileContent(
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
      const requirementsTxt = await bitbucketApiClient.getFileContent(
        repo.fullName,
        'requirements.txt',
        branch.name,
        token.accessToken
      );

      if (requirementsTxt) {
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

      return {
        framework: 'Static',
        buildCommand: '',
        outputDir: '.',
        installCommand: '',
        description: 'Static files only',
      };
    } catch (error) {
      console.error('[Bitbucket Provider] Framework detection error:', error);
      return null;
    }
  }

  /**
   * Get repository ID (UUID for Bitbucket)
   */
  getRepoId(repo: Repository): string {
    return repo.id;
  }

  /**
   * Get full repository name (workspace/repo)
   */
  getFullRepoName(repo: Repository): string {
    return repo.fullName;
  }
}

// Export the provider class and singleton
export const bitbucketProvider = new BitbucketProvider();
export { bitbucketTokenManager } from './token-manager';
export { bitbucketApiClient } from './api-client';
