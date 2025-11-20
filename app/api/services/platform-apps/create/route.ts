import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { createPlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { DeploymentService, type DeploymentConfig } from "@/lib/services";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  // Validate required environment variables
  const requiredEnvVars = [
    'JENKINS_URL',
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ZONE_ID',
    'KUBE_IP',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.error('[platform-apps/create] Missing environment variables:', missingVars);
    return NextResponse.json(
      { 
        error: 'Server configuration error',
        message: `Missing required environment variables: ${missingVars.join(', ')}`,
        details: 'Please configure all required environment variables in .env.local'
      },
      { status: 500 }
    );
  }

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-create",
      limit: 5,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "Too Many Requests",
          message: `Retry after ${rl.retryAfterSec}s`,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const validation = validateRequest(createPlatformAppSchema, body);
    if (!validation.success) return validation.response;

    const { env_vars, ...appData } = validation.data;

    // Prepare deployment configuration
    const deploymentConfig: DeploymentConfig = {
      name: appData.name,
      repository_url: appData.repository_url,
      branch: appData.branch || "main",
      framework: appData.framework,
      git_provider: appData.git_provider,
      repository_id: appData.repository_id,
      repository_name: appData.repository_name,
      user_id: auth.user!.id,
      build_command: appData.build_command,
      output_directory: appData.output_directory,
      env_vars: env_vars || [],
    };

    // Deploy using the deployment service
    const result = await DeploymentService.deploy(deploymentConfig);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Deployment failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Created App Successfully!',
      app_id: result.app_id,
      deployment_url: result.deployment_url,
      port: result.port,
    }, { status: 201 });
  } catch (err: any) {
    console.error('[platform-apps/create] Error:', err);
    return NextResponse.json({ 
      error: err?.message || 'Something went wrong.'
    }, { status: 500 });
  }
}
