import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { createPlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { DeploymentService, type DeploymentConfig } from "@/lib/services";
import { Platform_Apps } from "@/lib/supabase/queries";
import { Projects } from "@/lib/supabase/queries/projects";
import { ensureBalance, postProvisionBilling } from "@/config/billing-flow";
import { getRatesForPlatformApp } from "@/config/pricing";
import { Billing } from "@/lib/supabase/queries/billing";
import { NotificationService, createServiceNotification } from "@/lib/notifications/service";

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

    // Get instance size for billing (default to 'small')
    const instanceSize = ((appData as { size?: string }).size || 'small') as "small" | "medium" | "large";

    // Billing: Get rates based on instance size
    const { initialCost: INITIAL_COST, hourlyRate: HOURLY_RATE } = await getRatesForPlatformApp(instanceSize);

    // Check balance BEFORE creating resources
    const balCheck = await ensureBalance(auth.user!.id, INITIAL_COST);
    if (!balCheck.ok) {
      return NextResponse.json(
        { 
          error: "Insufficient credits", 
          balance: balCheck.balance, 
          required: INITIAL_COST,
          message: `You need at least $${INITIAL_COST.toFixed(2)} credits to deploy this app. Current balance: $${(balCheck.balance || 0).toFixed(2)}`
        },
        { status: 402 }
      );
    }

    // Check app limit per user (max 10 apps)
    const MAX_APPS_PER_USER = 10;
    const currentAppCount = await Platform_Apps.count_by_owner(auth.user!.id);
    if (currentAppCount >= MAX_APPS_PER_USER) {
      return NextResponse.json(
        { 
          error: 'App limit reached',
          message: `You have reached the maximum limit of ${MAX_APPS_PER_USER} apps. Please delete an existing app to create a new one.`,
          current_count: currentAppCount,
          max_limit: MAX_APPS_PER_USER
        },
        { status: 403 }
      );
    }

    // Check if app name already exists (globally unique for DNS/Jenkins)
    const nameExists = await Platform_Apps.check_name_exists(appData.name);
    if (nameExists) {
      return NextResponse.json(
        { 
          error: 'App name already exists',
          message: 'Please choose a different name. App names must be unique across all users.',
          field: 'name'
        },
        { status: 409 } // 409 Conflict
      );
    }

    // Store the ORIGINAL URL without token (for database)
    const original_repository_url = appData.repository_url;
    
    // Get GitHub access token for private repository access (same logic as repositories endpoint)
    let authenticated_repository_url = appData.repository_url;
    if (appData.git_provider === 'github' && authenticated_repository_url.startsWith('https://github.com/')) {
      const { createClient } = await import('@/lib/supabase/server');
      const supabase = await createClient();
      
      // Get session and user identity
      const { data: { session } } = await supabase.auth.getSession();
      
      let accessToken = null;
      
      if (session) {
        // Check for token in session first
        if (session.provider_token) {
          accessToken = session.provider_token;
        }
        // Fallback to identity data
        else if (session.user?.identities) {
          const githubIdentity = session.user.identities.find(id => id.provider === 'github');
          if (githubIdentity?.identity_data?.provider_token) {
            accessToken = githubIdentity.identity_data.provider_token;
          }
        }
      }
      
      // Last resort: check the github_tokens table with refresh logic
      if (!accessToken) {
        // Import the GitHub provider
        const { GitHubProvider } = await import('@/lib/providers/github');
        const githubProvider = new GitHubProvider();
        const tokenObj = await githubProvider.getToken(auth.user!.id);
        if (tokenObj?.accessToken) {
          accessToken = tokenObj.accessToken;
        }
      }
      
      if (accessToken) {
        // Inject token into URL for private repo access (only for Jenkins, not stored in DB)
        authenticated_repository_url = authenticated_repository_url.replace(
          'https://github.com/',
          `https://${accessToken}@github.com/`
        );
        console.log('[platform-apps/create] ✅ Injected GitHub token for private repository access');
      } else {
        console.log('[platform-apps/create] ⚠️ No GitHub token found - private repos may fail');
      }
    }
    
    // Get GitLab access token for private repository access
    // GitLab URL format: https://oauth2:<token>@gitlab.com/user/repo.git
    if (appData.git_provider === 'gitlab' && authenticated_repository_url.includes('gitlab.com')) {
      const { createClient } = await import('@/lib/supabase/server');
      const supabase = await createClient();
      
      // Get session and user identity
      const { data: { session } } = await supabase.auth.getSession();
      
      let accessToken = null;

      // First, check the gitlab_tokens table with auto-refresh (GitLab tokens expire in 2 hours!)
      const { getValidGitLabToken } = await import('@/lib/gitlab/token-refresh');
      const validToken = await getValidGitLabToken(auth.user!.id);
      if (validToken) {
        accessToken = validToken;
        console.log('[platform-apps/create] Found GitLab token in gitlab_tokens table (with auto-refresh)');
      }

      if (!accessToken && session?.user?.identities) {
        console.log("got session user identities....127");
        const gitlabIdentity = session.user.identities.find(id => id.provider === 'gitlab');

        if (gitlabIdentity?.identity_data?.provider_token) {
          console.log("got session user identity_data provider_token....131");
          accessToken = gitlabIdentity.identity_data.provider_token;
          console.log('[platform-apps/create] Found GitLab token in identity_data.provider_token');
        }
      }

      // Finally, fall back to session.provider_token only if this session is actually GitLab-based
      if (!accessToken && session?.provider_token && (session.user as { app_metadata?: { provider?: string } })?.app_metadata?.provider === 'gitlab') {
        console.log("got session success....120");
        accessToken = session.provider_token;
        console.log('[platform-apps/create] Found GitLab token in session.provider_token');
      }
      
      if (accessToken) {
        // GitLab uses oauth2:<token>@gitlab.com format for authenticated access
        // Handle both https://gitlab.com/... and https://www.gitlab.com/...
        authenticated_repository_url = authenticated_repository_url.replace(
          /https:\/\/(www\.)?gitlab\.com\//,
          `https://oauth2:${accessToken}@gitlab.com/`
        );
        console.log('[platform-apps/create] ✅ Injected GitLab token for private repository access');
      } else {
        console.log('[platform-apps/create] ⚠️ No GitLab token found - private repos may fail');
      }
    }

    // Handle Bitbucket token injection for private repositories
    // Bitbucket URL format: https://x-token-auth:<token>@bitbucket.org/workspace/repo.git
    if (appData.git_provider === 'bitbucket' && authenticated_repository_url.includes('bitbucket.org')) {
      const { createClient } = await import('@/lib/supabase/server');
      const supabase = await createClient();
      
      // Get session and user identity
      const { data: { session } } = await supabase.auth.getSession();
      
      let accessToken = null;

      // First, check the bitbucket_tokens table with auto-refresh (if table exists)
      // Bitbucket tokens expire in ~1-2 hours, so refresh is important
      try {
        const { getValidBitbucketToken } = await import('@/lib/bitbucket/token-refresh');
        const validToken = await getValidBitbucketToken(auth.user!.id);
        if (validToken) {
          accessToken = validToken;
          console.log('[platform-apps/create] Found Bitbucket token in bitbucket_tokens table (with auto-refresh)');
        }
      } catch {
        console.log('[platform-apps/create] bitbucket_tokens table not available, skipping DB token check');
      }

      if (!accessToken && session?.user?.identities) {
        const bitbucketIdentity = session.user.identities.find(id => id.provider === 'bitbucket');
        if (bitbucketIdentity?.identity_data?.provider_token) {
          accessToken = bitbucketIdentity.identity_data.provider_token;
          console.log('[platform-apps/create] Found Bitbucket token in identity_data.provider_token');
        }
      }

      // Finally, fall back to session.provider_token only if this session is actually Bitbucket-based
      if (!accessToken && session?.provider_token && (session.user as { app_metadata?: { provider?: string } })?.app_metadata?.provider === 'bitbucket') {
        accessToken = session.provider_token;
        console.log('[platform-apps/create] Found Bitbucket token in session.provider_token');
      }
      
      if (accessToken) {
        // Bitbucket uses x-token-auth:<token>@bitbucket.org format for authenticated access
        // Handle both https://bitbucket.org/... and https://www.bitbucket.org/...
        authenticated_repository_url = authenticated_repository_url.replace(
          /https:\/\/(www\.)?bitbucket\.org\//,
          `https://x-token-auth:${accessToken}@bitbucket.org/`
        );
        console.log('[platform-apps/create] ✅ Injected Bitbucket token for private repository access');
      } else {
        console.log('[platform-apps/create] ⚠️ No Bitbucket token found - private repos may fail');
      }
    }

    // Prepare deployment configuration
    const deploymentConfig: DeploymentConfig = {
      name: appData.name,
      repository_url: original_repository_url, // Store clean URL in database
      authenticated_url: authenticated_repository_url, // Use authenticated URL for Jenkins
      branch: appData.branch || "main",
      framework: appData.framework,
      git_provider: appData.git_provider,
      repository_id: appData.repository_id,
      repository_name: appData.repository_name,
      user_id: auth.user!.id,
      build_command: appData.build_command,
      output_directory: appData.output_directory,
      env_vars: env_vars || [],
      size: (appData as { size?: string }).size || 'small',
      auto_deploy: appData.auto_deploy || false,
      deploy_branch: appData.deploy_branch || appData.branch || 'main',
      project_id: appData.project_id,
    };

    // Deploy using the deployment service
    const result = await DeploymentService.deploy(deploymentConfig);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Deployment failed" },
        { status: 500 }
      );
    }

    // Add project log if project_id is provided
    if (appData.project_id && result.app_id) {
      try {
        await Projects.add_log({
          project_id: appData.project_id,
          event: "Platform App Created",
          text: `Deployed "${appData.name}" from ${appData.git_provider}/${appData.repository_name} (branch: ${appData.branch || 'main'})`,
        });
      } catch (logError) {
        console.warn('[platform-apps/create] Failed to add project log:', logError);
        // Don't fail the deployment, just log the warning
      }
    }

    // If auto_deploy is enabled, register webhook for the app
    if (appData.auto_deploy && result.app_id) {
      try {
        console.log('[platform-apps/create] Auto-deploy enabled, registering webhook...');
        
        // Get the appropriate access token for webhook registration
        let webhookToken = null;
        if (appData.git_provider === 'github') {
          const { GitHubProvider } = await import('@/lib/providers/github');
          const githubProvider = new GitHubProvider();
          const tokenObj = await githubProvider.getToken(auth.user!.id);
          webhookToken = tokenObj?.accessToken;
        } else if (appData.git_provider === 'gitlab') {
          const { getValidGitLabToken } = await import('@/lib/gitlab/token-refresh');
          webhookToken = await getValidGitLabToken(auth.user!.id);
        } else if (appData.git_provider === 'bitbucket') {
          try {
            const { getValidBitbucketToken } = await import('@/lib/bitbucket/token-refresh');
            webhookToken = await getValidBitbucketToken(auth.user!.id);
          } catch {
            console.log('[platform-apps/create] Bitbucket token refresh not available');
          }
        }

        if (!webhookToken) {
          // Fallback: try to use session/identity provider_token if available for this provider
          try {
            const { createClient } = await import('@/lib/supabase/server');
            const supabase = await createClient();
            const { data: { session } } = await supabase.auth.getSession();

            if (session) {
              const identity = session.user?.identities?.find((id) => id.provider === appData.git_provider);
              if (identity?.identity_data?.provider_token) {
                webhookToken = identity.identity_data.provider_token;
                console.log('[platform-apps/create] Using identity_data.provider_token as webhook token for', appData.git_provider);
              } else if (session.provider_token && (session.user as { app_metadata?: { provider?: string } })?.app_metadata?.provider === appData.git_provider) {
                webhookToken = session.provider_token;
                console.log('[platform-apps/create] Using session.provider_token as webhook token for', appData.git_provider);
              }
            }
          } catch (fallbackError) {
            console.log('[platform-apps/create] Webhook token fallback lookup failed:', fallbackError);
          }
        }

        if (webhookToken) {
          const { WebhookManager } = await import('@/lib/services/webhook-manager');
          
          const webhookResult = await WebhookManager.registerWebhook({
            app_id: result.app_id,
            provider: appData.git_provider,
            repository_name: appData.repository_name,
            access_token: webhookToken,
          });

          if (webhookResult.success) {
            console.log('[platform-apps/create] ✅ Webhook registered successfully');
          } else {
            console.warn('[platform-apps/create] ⚠️ Webhook registration failed:', webhookResult.error);
            // Don't fail the deployment, just log the warning
          }
        } else {
          console.warn('[platform-apps/create] ⚠️ No access token available for webhook registration');
        }
      } catch (webhookError) {
        console.error('[platform-apps/create] Webhook registration error:', webhookError);
        // Don't fail the deployment, just log the error
      }
    }

    // Post-provision billing: deduct upfront cost and register for hourly billing
    if (result.app_id) {
      try {
        await postProvisionBilling({
          userId: auth.user!.id,
          initialCost: INITIAL_COST,
          hourlyRate: HOURLY_RATE,
          serviceId: result.app_id,
          addActive: Billing.add_active_platform_app,
        });
        console.log('[platform-apps/create] ✅ Billing registered successfully', {
          userId: auth.user!.id,
          appId: result.app_id,
          initialCost: INITIAL_COST,
          hourlyRate: HOURLY_RATE,
        });
      } catch (billingError) {
        console.error('[platform-apps/create] ⚠️ Billing registration failed:', billingError);
        // Note: App is already deployed, so we log but don't fail
        // The billing team should be notified of orphaned resources
      }
    }

    // Create success notification
    await NotificationService.create(
      createServiceNotification({
        userId: auth.user!.id,
        type: 'success',
        action: 'created',
        serviceType: 'platform_app',
        serviceName: appData.name,
        serviceId: result.app_id,
        metadata: { 
          framework: appData.framework,
          repository: appData.repository_name,
          branch: appData.branch || 'main'
        }
      })
    );

    return NextResponse.json({
      message: 'Created App Successfully!',
      app_id: result.app_id,
      deployment_url: result.deployment_url,
      port: result.port,
      auto_deploy: appData.auto_deploy || false,
      billing: {
        initial_cost: INITIAL_COST,
        hourly_rate: HOURLY_RATE,
        instance_size: instanceSize,
      },
    }, { status: 201 });
  } catch (err: unknown) {
    console.error('[platform-apps/create] Error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Something went wrong.';
    
    // Create failure notification
    try {
      await NotificationService.create(
        createServiceNotification({
          userId: auth.user!.id,
          type: 'error',
          action: 'failed',
          serviceType: 'platform_app',
          serviceName: 'Application',
          error: errorMessage,
        })
      );
    } catch (notifError) {
      console.error('[platform-apps/create] Failed to create error notification:', notifError);
    }
    
    return NextResponse.json({ 
      error: errorMessage
    }, { status: 500 });
  }
}
