/**
 * GitHub API Client
 * Makes HTTP requests to GitHub API with proper error handling
 * 
 * Base URL: https://api.github.com
 * Headers: Authorization, Accept, User-Agent
 */

import { AuthToken, Repository, Branch } from '../types';

export class GitHubApiClient {
  private baseUrl = 'https://api.github.com';
  private userAgent = 'AhuraSense-Cloud-Platform';

  /**
   * Make a GET request to GitHub API
   */
  private async makeRequest(endpoint: string, token: string) {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': this.userAgent,
      }
    });

    return response;
  }

  /**
   * Handle GitHub API errors with meaningful messages
   */
  private handleError(status: number, message?: string) {
    const errors: Record<number, string> = {
      401: 'GitHub token is invalid or expired',
      403: 'GitHub API rate limit exceeded or insufficient permissions',
      404: 'Repository not found or access denied',
      500: 'GitHub API server error',
    };

    const errorMessage = errors[status] || `GitHub API error: ${status}`;
    const needsAuth = status === 401;

    return {
      success: false,
      error: errorMessage,
      status,
      needsAuth,
    };
  }

  /**
   * Get all repositories for authenticated user
   */
  async getRepositories(token: string): Promise<Repository[]> {
    try {
      const response = await this.makeRequest('/user/repos?sort=updated&per_page=100&visibility=all', token);

      if (!response.ok) {
        throw this.handleError(response.status);
      }

      const repos = await response.json() as any[];

      return repos.map((repo: any) => ({
        id: repo.id.toString(),
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description || '',
        private: repo.private,
        defaultBranch: repo.default_branch,
        language: repo.language,
        updatedAt: repo.updated_at,
        provider: 'github' as const,
        cloneUrl: repo.clone_url,
        htmlUrl: repo.html_url,
      }));
    } catch (error) {
      console.error('[GitHub API Client] Error fetching repositories:', error);
      throw error;
    }
  }

  /**
   * Get branches for a specific repository
   */
  async getBranches(repoFullName: string, token: string): Promise<Branch[]> {
    try {
      const response = await this.makeRequest(
        `/repos/${repoFullName}/branches?per_page=100`,
        token
      );

      if (!response.ok) {
        throw this.handleError(response.status);
      }

      const branches = await response.json() as any[];

      return branches.map((branch: any) => ({
        name: branch.name,
        commitSha: branch.commit.sha,
        protected: branch.protected,
      }));
    } catch (error) {
      console.error('[GitHub API Client] Error fetching branches:', error);
      throw error;
    }
  }

  /**
   * Get file content from a repository
   */
  async getFileContent(
    repoFullName: string,
    filePath: string,
    branch: string,
    token: string
  ): Promise<string | null> {
    try {
      const response = await this.makeRequest(
        `/repos/${repoFullName}/contents/${filePath}?ref=${encodeURIComponent(branch)}`,
        token
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null; // File doesn't exist
        }
        throw this.handleError(response.status);
      }

      const data = await response.json() as any;

      // GitHub returns content in base64
      if (data.content) {
        return Buffer.from(data.content, 'base64').toString('utf-8');
      }

      return null;
    } catch (error) {
      console.error('[GitHub API Client] Error fetching file:', error);
      return null;
    }
  }

  /**
   * Get user information
   */
  async getUser(token: string) {
    try {
      const response = await this.makeRequest('/user', token);

      if (!response.ok) {
        throw this.handleError(response.status);
      }

      const user = await response.json();
      return user;
    } catch (error) {
      console.error('[GitHub API Client] Error fetching user:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const githubApiClient = new GitHubApiClient();
