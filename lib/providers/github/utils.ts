/**
 * GitHub Provider Utilities
 * High-level functions for common GitHub operations
 * These functions handle user authentication and token management
 * 
 * Usage:
 * const repos = await github.fetchUserRepositories();
 * const branches = await github.fetchRepositoryBranches(repo);
 */

import { createClient } from '@/lib/supabase/server';
import { GitHubProvider } from './index';
import {
  Repository,
  RepositoriesResponse,
  BranchesResponse,
} from '../types';

const provider = new GitHubProvider();

/**
 * Fetch repositories for the authenticated user
 * This is called from API endpoint or components
 */
export async function fetchUserRepositories(): Promise<RepositoriesResponse> {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        repositories: [],
        message: 'Unauthorized',
        needsAppAuth: true,
      };
    }

    // Get user's GitHub token
    const session = await supabase.auth.getSession();

    let token = null;

    // Try session token first (fresh from OAuth)
    if (session?.data?.session?.provider_token) {
      token = session.data.session.provider_token;
    } else {
      // Try stored token
      const storedToken = await provider.getToken(user.id);
      if (storedToken) {
        token = storedToken.accessToken;
      }
    }

    if (!token) {
      return {
        repositories: [],
        message: 'GitHub account not connected',
        needsAppAuth: true,
      };
    }

    // Fetch repositories using token
    const result = await provider.getRepositories({ accessToken: token, tokenType: 'bearer', scope: 'repo user:email' });

    return result;
  } catch (error) {
    console.error('[GitHub Utils] Error fetching repositories:', error);

    return {
      repositories: [],
      message: 'Failed to fetch repositories',
    };
  }
}

/**
 * Fetch branches for a specific repository
 */
export async function fetchRepositoryBranches(repo: Repository): Promise<BranchesResponse> {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        branches: [],
        message: 'Unauthorized',
      };
    }

    // Get user's GitHub token
    const session = await supabase.auth.getSession();

    let token = null;

    // Try session token first (fresh from OAuth)
    if (session?.data?.session?.provider_token) {
      token = session.data.session.provider_token;
    } else {
      // Try stored token
      const storedToken = await provider.getToken(user.id);
      if (storedToken) {
        token = storedToken.accessToken;
      }
    }

    if (!token) {
      return {
        branches: [],
        message: 'GitHub account not connected',
      };
    }

    // Fetch branches using token
    const result = await provider.getBranches(repo, { accessToken: token, tokenType: 'bearer', scope: 'repo user:email' });

    return result;
  } catch (error) {
    console.error('[GitHub Utils] Error fetching branches:', error);

    return {
      branches: [],
      message: 'Failed to fetch branches',
    };
  }
}

/**
 * Export provider for direct usage
 */
export { provider as githubProvider };
