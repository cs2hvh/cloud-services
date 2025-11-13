import { createClient } from "@/lib/supabase/server";

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  language: string | null;
  updated_at: string;
  clone_url: string;
  html_url: string;
}

// interface TransformedRepo {
//   id: string;
//   name: string;
//   fullName: string;
//   description: string;
//   private: boolean;
//   defaultBranch: string;
//   language: string;
//   updatedAt: string;
//   provider: 'github';
//   cloneUrl: string;
//   htmlUrl: string;
// }

export async function GET() {
  try {
    const supabase = await createClient();
    
    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return Response.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

   // console.log('Fetching GitHub repositories for user:', user.id);

    // Get the current session to check for provider tokens
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return Response.json(
        { message: "No active session" },
        { status: 401 }
      );
    }

    // Check if user has GitHub provider linked
    const githubIdentity = session.user.identities?.find(
      identity => identity.provider === 'github'
    );

    if (!githubIdentity) {
      return Response.json(
        { message: "GitHub account not connected" },
        { status: 400 }
      );
    }

    // Get GitHub username for fallback
    const githubUsername = githubIdentity.identity_data?.user_name || 
                          githubIdentity.identity_data?.login || 
                          githubIdentity.identity_data?.preferred_username;

    // console.log('GitHub username:', githubUsername);
    // console.log('Provider token available:', !!session.provider_token);
    // console.log('Session keys:', Object.keys(session));

    // Try to use provider token if available
    const accessToken = null;

    if (accessToken) {
      // console.log('Using provider token for GitHub API access');
      
      // Test the token first
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AhuraSense-Cloud-Platform'
        }
      });

      if (userResponse.ok) {
        // Token works, fetch all repositories
        const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100&visibility=all', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'AhuraSense-Cloud-Platform'
          }
        });

        if (response.ok) {
          const repos: GitHubRepository[] = await response.json();
          const privateCount = repos.filter((repo: GitHubRepository) => repo.private).length;
          console.log(`Successfully fetched ${repos.length} repositories (${privateCount} private) from GitHub`);
          
          const transformedRepos = repos.map((repo: GitHubRepository) => ({
            id: repo.id.toString(),
            name: repo.name,
            fullName: repo.full_name,
            description: repo.description || '',
            private: repo.private,
            defaultBranch: repo.default_branch,
            language: repo.language || 'Unknown',
            updatedAt: repo.updated_at,
            provider: 'github',
            cloneUrl: repo.clone_url,
            htmlUrl: repo.html_url
          }));

          return Response.json({ 
            repositories: transformedRepos,
            note: `Loaded ${transformedRepos.length} repositories including ${privateCount} private repositories`
          }, { status: 200 });
        }
      } else {
        // console.log('Provider token is invalid, falling back to public repos');
      }
    }

    // Fallback to public repositories if no valid token
    if (githubUsername) {
      // console.log('Fetching public repositories for:', githubUsername);
      
      const response = await fetch(`https://api.github.com/users/${githubUsername}/repos?sort=updated&per_page=100`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'AhuraSense-Cloud-Platform'
        }
      });

      if (response.ok) {
        const repos = await response.json();
        const transformedRepos = repos.map((repo: GitHubRepository) => ({
          id: repo.id.toString(),
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description || '',
          private: repo.private,
          defaultBranch: repo.default_branch,
          language: repo.language || 'Unknown',
          updatedAt: repo.updated_at,
          provider: 'github',
          cloneUrl: repo.clone_url,
          htmlUrl: repo.html_url
        }));

        return Response.json({ 
          repositories: transformedRepos,
          warning: "Showing public repositories only. To access private repositories, you need to configure Supabase to store GitHub provider tokens.",
          instructions: "In Supabase Dashboard → Authentication → Providers → GitHub, make sure to enable 'Store provider tokens' if available."
        }, { status: 200 });
      }
    }

    return Response.json(
      { 
        message: "Unable to fetch GitHub repositories. Please check your GitHub connection.",
        debug: {
          hasProviderToken: !!session.provider_token,
          hasGithubIdentity: !!githubIdentity,
          githubUsername: githubUsername || 'Not found'
        }
      },
      { status: 400 }
    );

  } catch (error) {
    console.error("[GitHub Repositories API] Error:", error);
    return Response.json(
      { message: "Failed to fetch repositories" },
      { status: 500 }
    );
  }
}
