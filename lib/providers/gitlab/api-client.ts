/**
 * GitLab API Client
 * Low-level API calls to GitLab
 * All methods require a valid access token
 */

import { Repository, Branch } from '../types';

interface GitLabProject {
  id: number;
  name: string;
  path_with_namespace: string;
  description: string | null;
  visibility: 'private' | 'public' | 'internal';
  default_branch: string;
  last_activity_at: string;
  http_url_to_repo: string;
  web_url: string;
}

interface GitLabBranch {
  name: string;
  commit: {
    id: string;
  };
  protected: boolean;
}

interface GitLabFile {
  content: string;
  encoding: string;
}

export class GitLabApiClient {
  private baseUrl = 'https://gitlab.com/api/v4';

  /**
   * Get all repositories (projects) for the authenticated user
   */
  async getRepositories(accessToken: string): Promise<Repository[]> {
    const response = await fetch(
      `${this.baseUrl}/projects?membership=true&per_page=100&order_by=updated_at`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'User-Agent': 'AhuraSense-Cloud-Platform',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GitLab API] Failed to fetch repositories:', response.status, errorText);
      throw new Error(`GitLab API error: ${response.status}`);
    }

    const projects: GitLabProject[] = await response.json();

    // Transform to normalized Repository format
    return projects.map((project) => ({
      id: project.id.toString(),
      name: project.name,
      fullName: project.path_with_namespace,
      description: project.description || '',
      private: project.visibility === 'private',
      defaultBranch: project.default_branch || 'main',
      language: null, // GitLab doesn't return this in project list
      updatedAt: project.last_activity_at,
      provider: 'gitlab' as const,
      cloneUrl: project.http_url_to_repo,
      htmlUrl: project.web_url,
    }));
  }

  /**
   * Get branches for a specific project
   */
  async getBranches(projectId: string, accessToken: string): Promise<Branch[]> {
    const response = await fetch(
      `${this.baseUrl}/projects/${encodeURIComponent(projectId)}/repository/branches?per_page=100`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'User-Agent': 'AhuraSense-Cloud-Platform',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[GitLab API] Failed to fetch branches:', response.status, errorText);
      throw new Error(`GitLab API error: ${response.status}`);
    }

    const branches: GitLabBranch[] = await response.json();

    return branches.map((branch) => ({
      name: branch.name,
      commitSha: branch.commit?.id || '',
      protected: branch.protected,
    }));
  }

  /**
   * Get file content from a repository
   */
  async getFileContent(
    projectId: string,
    filePath: string,
    branch: string,
    accessToken: string
  ): Promise<string | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/projects/${encodeURIComponent(projectId)}/repository/files/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branch)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'User-Agent': 'AhuraSense-Cloud-Platform',
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const file: GitLabFile = await response.json();

      if (file.encoding === 'base64') {
        return Buffer.from(file.content, 'base64').toString('utf-8');
      }

      return file.content;
    } catch {
      return null;
    }
  }

  /**
   * Get repository language (requires separate API call for GitLab)
   */
  async getRepositoryLanguages(projectId: string, accessToken: string): Promise<string | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/projects/${encodeURIComponent(projectId)}/languages`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'User-Agent': 'AhuraSense-Cloud-Platform',
          },
        }
      );

      if (!response.ok) {
        return null;
      }

      const languages: Record<string, number> = await response.json();
      
      // Return the most used language
      const entries = Object.entries(languages);
      if (entries.length === 0) return null;
      
      return entries.sort((a, b) => b[1] - a[1])[0][0];
    } catch {
      return null;
    }
  }
}

// Export singleton instance
export const gitlabApiClient = new GitLabApiClient();
