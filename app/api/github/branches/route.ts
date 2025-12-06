/**
 * GitHub Branches API Endpoint
 * GET /api/github/branches?repo=owner/repo
 * 
 * Returns all branches for a specific repository
 * Uses modular GitHub provider from lib/providers/github
 */

import { createClient } from "@/lib/supabase/server";
import { fetchRepositoryBranches } from "@/lib/providers/github/utils";
import { Repository } from "@/lib/providers/types";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return Response.json(
        { message: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get repository name from query parameters
    const url = new URL(request.url);
    const repoFullName = url.searchParams.get('repo');

    if (!repoFullName) {
      return Response.json(
        { message: "Repository name is required" },
        { status: 400 }
      );
    }

    // Create a minimal repository object for the provider
    // The provider only needs fullName to fetch branches
    const repo: Repository = {
      id: '0',
      name: repoFullName.split('/')[1],
      fullName: repoFullName,
      description: '',
      private: false,
      defaultBranch: 'main',
      language: null,
      updatedAt: new Date().toISOString(),
      provider: 'github',
      cloneUrl: '',
      htmlUrl: '',
    };

    // Use modular GitHub provider
    const result = await fetchRepositoryBranches(repo);

    // Return branches
    return Response.json(result, { status: 200 });

  } catch (error) {
    console.error("[GitHub Branches API] Error:", error);
    return Response.json(
      { message: "Failed to fetch branches" },
      { status: 500 }
    );
  }
}