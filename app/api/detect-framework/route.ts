import { createClient } from "@/lib/supabase/server";
import { GitHubProvider } from "@/lib/providers/github";

// Core types
interface FileContent {
  content: string;
  encoding: string;
}

interface DetectionContext {
  provider: string;
  repoFullName: string;
  branch: string;
  accessToken: string;
  fileContents: Map<string, FileContent>;
}

interface DetectionResult {
  framework: string;
  version: string;
  language: string;
  hasDockerfile?: boolean;
  buildSystem?: string;
  [key: string]: unknown;
}

// File fetching functions
async function fetchFile(provider: string, repoFullName: string, filePath: string, branch: string, accessToken: string): Promise<FileContent | null> {
  const endpoints: Record<string, string> = {
    github: `https://api.github.com/repos/${repoFullName}/contents/${filePath}?ref=${encodeURIComponent(branch)}`,
    gitlab: `https://gitlab.com/api/v4/projects/${encodeURIComponent(repoFullName)}/repository/files/${filePath}?ref=${encodeURIComponent(branch)}`,
    bitbucket: `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(repoFullName)}/src/${encodeURIComponent(branch)}/${filePath}`
  };

  const headers: Record<string, Record<string, string>> = {
    github: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'AhuraSense-Cloud-Platform'
    },
    gitlab: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    },
    bitbucket: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  };

  try {
    const response = await fetch(endpoints[provider], { headers: headers[provider] });
    if (response.ok) {
      if (provider === 'bitbucket') {
        const content = await response.text();
        return { content, encoding: 'utf-8' };
      } else {
        const data = await response.json();
        return { content: atob(data.content), encoding: 'utf-8' };
      }
    }
  } catch {
    console.log(`Failed to fetch ${filePath} from ${provider}`);
  }
  
  return null;
}

// Detection functions
async function detectFromPackageJson(context: DetectionContext): Promise<Partial<DetectionResult>> {
  const packageJsonContent = context.fileContents.get('package.json');
  if (!packageJsonContent) return {};
  
  try {
    const packageJson = JSON.parse(packageJsonContent.content);
    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};
    
    // Check for Vite in devDependencies (common for Vite projects)
    const hasVite = devDeps.vite || deps.vite;
    
    if (deps.next) {
      return { framework: "Next.js", version: deps.next, language: "JavaScript" };
    } else if (deps.nuxt) {
      return { framework: "Nuxt.js", version: deps.nuxt, language: "JavaScript" };
    } else if (deps.react) {
      // Check if it's React with Vite
      if (hasVite) {
        return { framework: "Vite-React", version: deps.react, language: "JavaScript", buildSystem: "Vite" };
      }
      return { framework: "React", version: deps.react, language: "JavaScript" };
    } else if (deps.vue || devDeps.vue) {
      // Vue 3 typically uses Vite, but check anyway (check both deps and devDeps)
      return { framework: "Vue.js", version: deps.vue || devDeps.vue, language: "JavaScript", buildSystem: hasVite ? "Vite" : "Vue CLI" };
    } else if (deps['@angular/core'] || devDeps['@angular/core']) {
      return { framework: "Angular", version: deps['@angular/core'] || devDeps['@angular/core'], language: "JavaScript" };
    } else if (deps.svelte || deps['@sveltejs/kit'] || devDeps.svelte || devDeps['@sveltejs/kit']) {
      // SvelteKit and Svelte are often in devDependencies
      const hasSvelteKit = deps['@sveltejs/kit'] || devDeps['@sveltejs/kit'];
      const svelteVersion = deps.svelte || devDeps.svelte || deps['@sveltejs/kit'] || devDeps['@sveltejs/kit'];
      return { framework: hasSvelteKit ? "SvelteKit" : "Svelte", version: svelteVersion, language: "JavaScript" };
    } else if (deps.express) {
      return { framework: "Express", version: deps.express, language: "JavaScript" };
    } else if (Object.keys(deps).length > 0 || Object.keys(devDeps).length > 0) {
      return { framework: "Node.js", language: "JavaScript" };
    }
  } catch {
    console.log("Failed to parse package.json");
  }
  
  return {};
}

async function detectFromRequirementsTxt(context: DetectionContext): Promise<Partial<DetectionResult>> {
  const requirementsContent = context.fileContents.get('requirements.txt');
  if (!requirementsContent) return {};
  
  const lines = requirementsContent.content.split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line && !line.startsWith('#'));
  
  for (const line of lines) {
    if (line.toLowerCase().includes('django')) {
      return { framework: "Django", version: line.includes('==') ? line.split('==')[1] : "", language: "Python" };
    } else if (line.toLowerCase().includes('flask')) {
      return { framework: "Flask", version: line.includes('==') ? line.split('==')[1] : "", language: "Python" };
    } else if (line.toLowerCase().includes('fastapi')) {
      return { framework: "FastAPI", version: line.includes('==') ? line.split('==')[1] : "", language: "Python" };
    }
  }
  
  return { framework: "Python", language: "Python" };
}

async function detectDocker(context: DetectionContext): Promise<Partial<DetectionResult>> {
  const result: Partial<DetectionResult> = {};
  
  if (context.fileContents.has('Dockerfile')) {
    result.hasDockerfile = true;
  }
  
  if (context.fileContents.has('docker-compose.yml')) {
    result.buildSystem = "Docker Compose";
  }
  
  return result;
}

async function detectFromComposerJson(context: DetectionContext): Promise<Partial<DetectionResult>> {
  const composerJsonContent = context.fileContents.get('composer.json');
  if (!composerJsonContent) return {};
  
  try {
    const composerJson = JSON.parse(composerJsonContent.content);
    if (composerJson.require) {
      if (composerJson.require['laravel/framework']) {
        return { framework: "Laravel", version: composerJson.require['laravel/framework'], language: "PHP" };
      } else if (composerJson.require['symfony/symfony']) {
        return { framework: "Symfony", version: composerJson.require['symfony/symfony'], language: "PHP" };
      } else {
        return { framework: "PHP", language: "PHP" };
      }
    }
  } catch {
    console.log("Failed to parse composer.json");
  }
  
  return {};
}

async function detectFromGemfile(context: DetectionContext): Promise<Partial<DetectionResult>> {
  const gemfileContent = context.fileContents.get('Gemfile');
  if (!gemfileContent) return {};
  
  if (gemfileContent.content.includes('rails')) {
    return { framework: "Ruby on Rails", language: "Ruby" };
  } else if (gemfileContent.content.includes('sinatra')) {
    return { framework: "Sinatra", language: "Ruby" };
  } else {
    return { framework: "Ruby", language: "Ruby" };
  }
}

// Detection pipeline
const detectionFunctions = [
  detectFromPackageJson,
  detectFromRequirementsTxt,
  detectDocker,
  detectFromComposerJson,
  detectFromGemfile
];

async function runDetection(context: DetectionContext): Promise<DetectionResult> {
  // Collect all required files
  const allRequiredFiles = new Set<string>();
  // For simplicity, we'll check for common files
  const commonFiles = ['package.json', 'requirements.txt', 'Dockerfile', 'docker-compose.yml', 'composer.json', 'Gemfile'];
  commonFiles.forEach(file => allRequiredFiles.add(file));
  
  // Fetch all required files
  const fileContents = new Map<string, FileContent>();
  for (const filePath of allRequiredFiles) {
    const fileContent = await fetchFile(
      context.provider, 
      context.repoFullName, 
      filePath, 
      context.branch, 
      context.accessToken
    );
    
    if (fileContent) {
      fileContents.set(filePath, fileContent);
    }
  }
  
  // Update context with fetched files
  context.fileContents = fileContents;
  
  // Run all detection functions
  const result: DetectionResult = {
    framework: "Static",
    version: "",
    language: "Static"
  };
  
  for (const detectionFunction of detectionFunctions) {
    try {
      const functionResult = await detectionFunction(context);
      Object.assign(result, functionResult);
    } catch (error) {
      console.log(`Detection function failed:`, error);
    }
  }
  
  return result;
}

// Main API handler
export async function POST(request: Request) {
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

    // Get the current session to check for provider tokens
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return Response.json(
        { message: "No active session" },
        { status: 401 }
      );
    }

    const { provider, repoFullName, branch = "main" } = await request.json();
    
    if (!provider || !repoFullName) {
      return Response.json(
        { message: "Provider and repository name are required" },
        { status: 400 }
      );
    }
    
    // Validate provider
    const supportedProviders = ['github', 'gitlab', 'bitbucket'];
    if (!supportedProviders.includes(provider)) {
      return Response.json(
        { message: "Unsupported provider" },
        { status: 400 }
      );
    }
    
    // Validate repoFullName format to prevent path traversal attacks
    if (typeof repoFullName !== 'string' || repoFullName.includes('../') || repoFullName.includes('..\\')) {
      return Response.json(
        { message: "Invalid repository name" },
        { status: 400 }
      );
    }
    
    // Validate branch name
    if (typeof branch !== 'string' || branch.includes('../') || branch.includes('..\\')) {
      return Response.json(
        { message: "Invalid branch name" },
        { status: 400 }
      );
    }

    // Get access token based on provider
    const identity = session.user.identities?.find(
      identity => identity.provider === provider
    );

    let accessToken = null;

    // Source 1: Database stored tokens (most reliable for persistent access)
    if (provider === 'github') {
      const githubProvider = new GitHubProvider();
      const storedToken = await githubProvider.getToken(user.id);
      if (storedToken) {
        accessToken = storedToken.accessToken;
        console.log('[Detect Framework] Found GitHub token in github_tokens table');
      }
    } else if (provider === 'gitlab') {
      try {
        const { getValidGitLabToken } = await import('@/lib/gitlab/token-refresh');
        const storedToken = await getValidGitLabToken(user.id);
        if (storedToken) {
          accessToken = storedToken;
          console.log('[Detect Framework] Found GitLab token in gitlab_tokens table');
        }
      } catch {
        console.log('[Detect Framework] GitLab token refresh not available');
      }
    } else if (provider === 'bitbucket') {
      try {
        const { getValidBitbucketToken } = await import('@/lib/bitbucket/token-refresh');
        const storedToken = await getValidBitbucketToken(user.id);
        if (storedToken) {
          accessToken = storedToken;
          console.log('[Detect Framework] Found Bitbucket token in bitbucket_tokens table');
        }
      } catch {
        console.log('[Detect Framework] Bitbucket token refresh not available');
      }
    }

    // Source 2: Identity data provider_token
    if (!accessToken && identity?.identity_data?.provider_token) {
      accessToken = identity.identity_data.provider_token;
      console.log(`[Detect Framework] Found token in identity_data.provider_token for ${provider}`);
    }

    // Source 3: Session provider_token, but only if this session actually belongs to this provider
    if (!accessToken && session.provider_token && (session.user as { app_metadata?: { provider?: string } })?.app_metadata?.provider === provider) {
      accessToken = session.provider_token;
      console.log(`[Detect Framework] Found token in session.provider_token for ${provider}`);
    }

    if (!accessToken) {
      return Response.json(
        { message: `${provider} account not connected. Please connect your ${provider} account.`, needsAuth: true },
        { status: 400 }
      );
    }

    // Perform detection using functional pipeline
    const context: DetectionContext = {
      provider,
      repoFullName,
      branch,
      accessToken,
      fileContents: new Map()
    };
    
    const detectionResult = await runDetection(context);

    return Response.json({
      framework: detectionResult.framework,
      version: detectionResult.version,
      language: detectionResult.language,
      hasDockerfile: detectionResult.hasDockerfile,
      buildSystem: detectionResult.buildSystem,
      metadata: detectionResult
    }, { status: 200 });

  } catch (error) {
    console.error("[Framework Detection API] Error:", error);
    return Response.json(
      { message: "Failed to detect framework" },
      { status: 500 }
    );
  }
}