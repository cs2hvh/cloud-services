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

// /2.0/user/workspaces returns { values: [{ workspace: { slug, name, uuid }, permission }] }
interface BitbucketWorkspaceMembership {
  workspace: {
    slug: string;
    name: string;
    uuid: string;
  };
}

export class BitbucketApiClient {
  private baseUrl = 'https://api.bitbucket.org/2.0';

  /**
   * Get all workspaces the authenticated user has access to
   * Uses the new /2.0/user/workspaces endpoint (replaces deprecated /2.0/workspaces)
   * Follows pagination to return all workspaces.
   */
  private async getWorkspaces(accessToken: string): Promise<{ slug: string; name: string; uuid: string }[]> {
    const results: { slug: string; name: string; uuid: string }[] = [];
    let url: string | undefined = `${this.baseUrl}/user/workspaces?pagelen=100`;

    while (url) {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'User-Agent': 'AhuraSense-Cloud-Platform',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Bitbucket API] Failed to fetch workspaces:', response.status, errorText);
        throw new Error(`Bitbucket API error fetching workspaces: ${response.status}`);
      }

      const data: BitbucketPaginatedResponse<BitbucketWorkspaceMembership> = await response.json();
      results.push(...data.values.map((m) => m.workspace));
      url = data.next;
    }

    return results;
  }

  /**
   * Get all repositories for the authenticated user
   * Uses workspace-scoped endpoint /2.0/repositories/{workspace} (replaces deprecated /2.0/repositories)
   * See: https://developer.atlassian.com/cloud/bitbucket/changelog/#CHANGE-3022
   */
  async getRepositories(accessToken: string): Promise<Repository[]> {
    // Step 1: Get all workspaces
    const workspaces = await this.getWorkspaces(accessToken);

    if (workspaces.length === 0) {
      console.warn('[Bitbucket API] No workspaces found for user');
      return [];
    }

    // Step 2: Fetch repos from each workspace with bounded concurrency (max 3 parallel)
    // to avoid bursting the Bitbucket API rate limits when a user belongs to many workspaces.
    const CONCURRENCY = 3;
    const allWsRepos: BitbucketRepository[][] = [];

    for (let i = 0; i < workspaces.length; i += CONCURRENCY) {
      const batch = workspaces.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (ws) => {
          const wsRepos: BitbucketRepository[] = [];
          let url: string | undefined =
            `${this.baseUrl}/repositories/${ws.slug}?sort=-updated_on&pagelen=100`;

          while (url) {
            try {
              const response = await fetch(url, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Accept': 'application/json',
                  'User-Agent': 'AhuraSense-Cloud-Platform',
                },
              });

              if (!response.ok) {
                console.error(`[Bitbucket API] Failed to fetch repos for workspace ${ws.slug}:`, response.status);
                break;
              }

              const data: BitbucketPaginatedResponse<BitbucketRepository> = await response.json();
              wsRepos.push(...data.values);
              url = data.next;
            } catch (error) {
              console.error(`[Bitbucket API] Error fetching repos for workspace ${ws.slug}:`, error);
              break;
            }
          }

          return wsRepos;
        })
      );
      allWsRepos.push(...batchResults);
    }
    const seen = new Set<string>();
    const allRepos = allWsRepos.flat().filter((repo) => {
      if (seen.has(repo.full_name)) return false;
      seen.add(repo.full_name);
      return true;
    });

    // Transform to normalized Repository format
    return allRepos.map((repo) => {
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
