/**
 * Bitbucket API Client
 * Low-level API calls to Bitbucket
 * All methods require a valid access token
 */

import { Repository, Branch } from '../types';

interface BitbucketRepository {
  uuid: string;
  name: string;
  full_name: string;
  description: string | null;
  is_private: boolean;
  mainbranch?: { name: string };
  language: string | null;
  updated_on: string;
  links?: {
    clone?: { name: string; href: string }[];
    html?: { href: string };
  };
}

interface BitbucketBranch {
  name: string;
  target: {
    hash: string;
  };
}

interface BitbucketPaginatedResponse<T> {
  values: T[];
  next?: string;
  page?: number;
  pagelen?: number;
  size?: number;
}

export class BitbucketApiClient {
  private baseUrl = 'https://api.bitbucket.org/2.0';

  /**
   * Get all repositories for the authenticated user
   */
  async getRepositories(accessToken: string): Promise<Repository[]> {
    const response = await fetch(
      `${this.baseUrl}/repositories?role=member&sort=-updated_on&pagelen=100`,
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
      console.error('[Bitbucket API] Failed to fetch repositories:', response.status, errorText);
      throw new Error(`Bitbucket API error: ${response.status}`);
    }

    const data: BitbucketPaginatedResponse<BitbucketRepository> = await response.json();

    // Transform to normalized Repository format
    return data.values.map((repo) => {
      // Get clone URL (prefer HTTPS)
      const cloneUrl = repo.links?.clone?.find(c => c.name === 'https')?.href 
        || `https://bitbucket.org/${repo.full_name}.git`;

      return {
        id: repo.uuid,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description || '',
        private: repo.is_private,
        defaultBranch: repo.mainbranch?.name || 'master',
        language: repo.language || null,
        updatedAt: repo.updated_on,
        provider: 'bitbucket' as const,
        cloneUrl: cloneUrl,
        htmlUrl: repo.links?.html?.href || `https://bitbucket.org/${repo.full_name}`,
      };
    });
  }

  /**
   * Get branches for a specific repository
   */
  async getBranches(repoFullName: string, accessToken: string): Promise<Branch[]> {
    const response = await fetch(
      `${this.baseUrl}/repositories/${repoFullName}/refs/branches?pagelen=100`,
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
      console.error('[Bitbucket API] Failed to fetch branches:', response.status, errorText);
      throw new Error(`Bitbucket API error: ${response.status}`);
    }

    const data: BitbucketPaginatedResponse<BitbucketBranch> = await response.json();

    return data.values.map((branch) => ({
      name: branch.name,
      commitSha: branch.target?.hash || '',
      protected: false, // Bitbucket doesn't expose this in the branches API easily
    }));
  }

  /**
   * Get file content from a repository
   */
  async getFileContent(
    repoFullName: string,
    filePath: string,
    branch: string,
    accessToken: string
  ): Promise<string | null> {
    try {
      const response = await fetch(
        `${this.baseUrl}/repositories/${repoFullName}/src/${branch}/${filePath}`,
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

      return await response.text();
    } catch {
      return null;
    }
  }
}

// Export singleton instance
export const bitbucketApiClient = new BitbucketApiClient();
