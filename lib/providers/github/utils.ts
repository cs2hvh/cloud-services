/**
 * GitHub Provider Utilities
 * High-level functions for common GitHub operations
 * These functions handle user authentication and token management
 * 
 * KEY FIX: This now properly uses the stored GitHub token from github_tokens table
 * instead of session.provider_token, which only works for the login provider.
 * This ensures GitHub repos can be fetched even when logged in with GitLab/Bitbucket.
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
 * 
 * IMPORTANT: We prioritize the stored token from github_tokens table because:
 * 1. It works regardless of which provider the user logged in with
 * 2. session.provider_token is ONLY valid for the login provider
 */
export async function fetchUserRepositories(): Promise<RepositoriesResponse> {
  try {
    const supabase = await createClient();

    // Get current user - works regardless of login provider
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        repositories: [],
        message: 'Unauthorized',
        needsAppAuth: true,
      };
    }

    console.log('[GitHub Utils] Fetching repositories for user:', user.id);

    // PRIORITY: Try stored token first - this works for cross-provider auth
    // The token manager uses SERVICE CLIENT so it doesn't depend on session
    let token = null;
    const storedToken = await provider.getToken(user.id);
    if (storedToken) {
      token = storedToken.accessToken;
      console.log('[GitHub Utils] Using stored token from github_tokens table');
    }
    
    // FALLBACK: Only use session token if:
    // 1. No stored token exists
    // 2. The session was created with GitHub (not GitLab/Bitbucket)
    if (!token) {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Check if the current session is actually a GitHub session
      const isGitHubSession = session?.user?.app_metadata?.provider === 'github' ||
        session?.user?.identities?.some(id => id.provider === 'github' && id.identity_id);
      
      if (session?.provider_token && isGitHubSession) {
        token = session.provider_token;
        console.log('[GitHub Utils] Using session.provider_token (GitHub session) — storing for future use');
        
        // Store for future cross-provider auth. Pass username if available in session metadata.
        const ghLogin = session.user?.user_metadata?.user_name || session.user?.user_metadata?.preferred_username;
        const ghId = session.user?.user_metadata?.provider_id
          ? Number(session.user.user_metadata.provider_id)
          : undefined;
        await provider.storeToken(user.id, {
          accessToken: token,
          tokenType: 'bearer',
          scope: 'repo user:email',
        }, ghLogin ? { username: ghLogin, githubUserId: ghId } : undefined);
      }
    }

    if (!token) {
      console.log('[GitHub Utils] No GitHub token found for user:', user.id);
      return {
        repositories: [],
        message: 'GitHub account not connected. Please connect your GitHub account to access repositories.',
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

    // PRIORITY: Try stored token first - this works for cross-provider auth
    let token = null;
    const storedToken = await provider.getToken(user.id);
    if (storedToken) {
      token = storedToken.accessToken;
    }
    
    // FALLBACK: Only use session token if GitHub session
    if (!token) {
      const { data: { session } } = await supabase.auth.getSession();
      const isGitHubSession = session?.user?.app_metadata?.provider === 'github';
      
      if (session?.provider_token && isGitHubSession) {
        token = session.provider_token;
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
