/**
 * Platform App Service
 * Centralized business logic for platform app operations
 * Used by both internal service endpoints and public v1 API
 */
import { DeploymentService, type DeploymentConfig } from "./deployment";
import { Platform_Apps, Platform_App_Deployments } from "@/lib/supabase/queries";
import { Projects } from "@/lib/supabase/queries/projects";
import { Billing } from "@/lib/supabase/queries/billing";
import { NotificationService, createServiceNotification } from "@/lib/notifications/service";
import { AuditLogService } from "@/lib/audit";
import { AppStatusService } from "./app-status";
import { getRatesForPlatformApp } from "@/config/pricing";
import { ensureBalance, postProvisionBilling } from "@/config/billing-flow";

export interface CreateAppRequest {
  name: string;
  git_provider: 'github' | 'gitlab' | 'bitbucket';
  repository_id: string;
  repository_name: string;
  repository_url: string;
  branch?: string;
  framework: string;
  build_command?: string;
  output_directory?: string;
  project_id?: string;
  env_vars?: Array<{ key: string; value: string }>;
  size?: 'small' | 'medium' | 'large';
  auto_deploy?: boolean;
  deploy_branch?: string;
  container_port?: number;
  userId: string;
  userEmail?: string;
  auditContext?: {
    ip_address?: string;
    user_agent?: string;
    request_id?: string;
    user_role?: 'user' | 'admin';
  };
}

export interface CreateAppResult {
  success: boolean;
  appId?: string;
  deploymentUrl?: string;
  port?: number;
  partialSuccess?: boolean;
  billingInfo?: {
    initialCost: number;
    hourlyRate: number;
  };
  error?: string;
  errorCode?: string;
  balance?: number;
  required?: number;
  currentCount?: number;
  maxLimit?: number;
}

export interface DeleteAppOptions {
  appId: string;
  userId: string;
  isAdmin?: boolean;
  audit_context?: {
    ip_address?: string;
    user_agent?: string;
    request_id?: string;
    user_email?: string;
    user_role?: 'user' | 'admin';
  };
}

export interface DeleteAppResult {
  success: boolean;
  appName: string;
  error?: string;
}

export interface GetAppOptions {
  appId: string;
  userId: string;
  syncStatus?: boolean;  // Sync live status from Kubernetes
  includeEnvVars?: boolean;
}

export interface ListAppsOptions {
  userId: string;
  includeRollbackInfo?: boolean;  // Check deployment history for rollback capability
}

export interface UpdateAppMetadataOptions {
  appId: string;
  userId: string;
  name?: string;
  autoDeploy?: boolean;
}

type GitProvider = CreateAppRequest["git_provider"];

export class PlatformAppService {
  private static async getSessionProviderToken(provider: GitProvider): Promise<string | null> {
    try {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) return null;

      if (provider === "github") {
        if (session.provider_token) return session.provider_token;
        const githubIdentity = session.user?.identities?.find((id) => id.provider === "github");
        const identityToken = githubIdentity?.identity_data?.provider_token;
        return typeof identityToken === "string" ? identityToken : null;
      }

      const providerIdentity = session.user?.identities?.find((id) => id.provider === provider);
      const identityToken = providerIdentity?.identity_data?.provider_token;
      if (typeof identityToken === "string") return identityToken;

      const sessionProvider =
        (session.user as { app_metadata?: { provider?: string } })?.app_metadata?.provider;
      if (session.provider_token && sessionProvider === provider) {
        return session.provider_token;
      }

      return null;
    } catch {
      return null;
    }
  }

  private static async resolveProviderToken(
    provider: GitProvider,
    userId: string
  ): Promise<string | null> {
    if (provider === "github") {
      const sessionToken = await this.getSessionProviderToken("github");
      if (sessionToken) return sessionToken;

      try {
        const { GitHubProvider } = await import("@/lib/providers/github");
        const githubProvider = new GitHubProvider();
        const tokenObj = await githubProvider.getToken(userId);
        return tokenObj?.accessToken ?? null;
      } catch {
        return null;
      }
    }

    if (provider === "gitlab") {
      try {
        const { getValidGitLabToken } = await import("@/lib/gitlab/token-refresh");
        const token = await getValidGitLabToken(userId);
        if (token) return token;
      } catch {
        // fall through to session token fallback
      }
      return this.getSessionProviderToken("gitlab");
    }

    try {
      const { getValidBitbucketToken } = await import("@/lib/bitbucket/token-refresh");
      const token = await getValidBitbucketToken(userId);
      if (token) return token;
    } catch {
      // fall through to session token fallback
    }
    return this.getSessionProviderToken("bitbucket");
  }

  private static injectProviderToken(
    repositoryUrl: string,
    provider: GitProvider,
    token: string | null
  ): string {
    if (!token) return repositoryUrl;

    if (provider === "github" && repositoryUrl.startsWith("https://github.com/")) {
      return repositoryUrl.replace("https://github.com/", `https://${token}@github.com/`);
    }

    if (provider === "gitlab" && repositoryUrl.includes("gitlab.com")) {
      return repositoryUrl.replace(
        /https:\/\/(www\.)?gitlab\.com\//,
        `https://oauth2:${token}@gitlab.com/`
      );
    }

    if (provider === "bitbucket" && repositoryUrl.includes("bitbucket.org")) {
      return repositoryUrl.replace(
        /https:\/\/(www\.)?bitbucket\.org\//,
        `https://x-token-auth:${token}@bitbucket.org/`
      );
    }

    return repositoryUrl;
  }

  /**
   * Create a new platform app with full deployment setup
   * - Validates project ownership and app limits
   * - Checks user balance
   * - Injects repository tokens for private repos
   * - Deploys via DeploymentService
   * - Registers billing
   * - Creates audit log
   * - Sends notifications
   * - Registers webhook if auto_deploy enabled
   */
  static async createApp(request: CreateAppRequest): Promise<CreateAppResult> {
    try {
      // 1. Validate project ownership
      if (request.project_id) {
        const project = await Projects.get_by_id(request.project_id);
        if (!project) {
          return {
            success: false,
            error: "Project not found",
            errorCode: "NOT_FOUND",
          };
        }

        if (project.owner !== request.userId) {
          return {
            success: false,
            error: "You do not have permission to create an app in this project",
            errorCode: "FORBIDDEN",
          };
        }
      }

      // 2. Check app limit per user (max 20 apps)
      const MAX_APPS_PER_USER = 20;
      const currentAppCount = await Platform_Apps.count_by_owner(request.userId);
      if (currentAppCount >= MAX_APPS_PER_USER) {
        return {
          success: false,
          error: "App limit reached",
          errorCode: "APP_LIMIT_EXCEEDED",
          currentCount: currentAppCount,
          maxLimit: MAX_APPS_PER_USER,
        };
      }

      // 3. Check app name uniqueness
      const nameExists = await Platform_Apps.check_name_exists(request.name);
      if (nameExists) {
        return {
          success: false,
          error: "App name already exists",
          errorCode: "NAME_EXISTS",
        };
      }

      // 4. Check billing
      const instanceSize = (request.size || 'small') as "small" | "medium" | "large";
      const { initialCost: INITIAL_COST, hourlyRate: HOURLY_RATE } =
        await getRatesForPlatformApp(instanceSize);

      const balCheck = await ensureBalance(request.userId, INITIAL_COST);
      if (!balCheck.ok) {
        return {
          success: false,
          error: "Insufficient credits",
          errorCode: "INSUFFICIENT_BALANCE",
          balance: balCheck.balance,
          required: INITIAL_COST,
        };
      }

      // 5. Inject repository tokens for private repo access
      const providerToken = await this.resolveProviderToken(request.git_provider, request.userId);
      const authenticatedUrl = this.injectProviderToken(
        request.repository_url,
        request.git_provider,
        providerToken
      );

      // 6. Deploy application via DeploymentService
      const deploymentConfig: DeploymentConfig = {
        name: request.name,
        repository_url: request.repository_url, // Clean URL (no token) for database
        authenticated_url: authenticatedUrl, // Authenticated URL for Jenkins
        branch: request.branch || "main",
        framework: request.framework,
        git_provider: request.git_provider,
        repository_id: request.repository_id,
        repository_name: request.repository_name,
        user_id: request.userId,
        build_command: request.build_command,
        output_directory: request.output_directory,
        env_vars: request.env_vars || [],
        size: instanceSize,
        auto_deploy: request.auto_deploy || false,
        deploy_branch: request.deploy_branch || request.branch || 'main',
        project_id: request.project_id,
        container_port: request.container_port,
      };

      const deploymentResult = await DeploymentService.deploy(deploymentConfig);
      if (!deploymentResult.success) {
        return {
          success: false,
          error: deploymentResult.error || "Deployment failed",
          errorCode: "DEPLOYMENT_FAILED",
        };
      }

      const appId = deploymentResult.app_id!;

      // 7. Add project activity log
      if (request.project_id) {
        try {
          await Projects.add_log({
            project_id: request.project_id,
            event: "Platform App Created",
            text: `Deployed "${request.name}" from ${request.git_provider}/${request.repository_name} (branch: ${request.branch || 'main'})`,
          });
        } catch (logErr) {
          console.warn('[PlatformAppService.createApp] Failed to add project log:', logErr);
        }
      }

      // 8. Register billing — failure is returned as an error (matches K8s pattern)
      try {
        await postProvisionBilling({
          userId: request.userId,
          initialCost: INITIAL_COST,
          hourlyRate: HOURLY_RATE,
          serviceId: appId,
          addActive: Billing.add_active_platform_app,
        });
      } catch (billingErr) {
        const billingMessage = billingErr instanceof Error ? billingErr.message : String(billingErr);
        try {
          await NotificationService.create(
            createServiceNotification({
              userId: request.userId,
              type: "error",
              action: "failed",
              serviceType: "platform_app",
              serviceName: request.name,
              serviceId: appId,
              error: `Billing registration failed after deployment: ${billingMessage}`,
            })
          );
        } catch (notifErr) {
          console.error("[PlatformAppService.createApp] Billing failure notification failed:", notifErr);
        }
        return {
          success: false,
          error: `Post-provision billing failed: ${billingMessage}`,
          errorCode: "POST_PROVISION_BILLING_FAILED",
          appId,
          deploymentUrl: deploymentResult.deployment_url,
          port: deploymentResult.port,
          partialSuccess: true,
        };
      }

      // 9. Create audit log
      if (request.auditContext) {
        try {
          await AuditLogService.create({
            user_id: request.userId,
            user_role: request.auditContext.user_role || 'user',
            user_email: request.userEmail,
            action: 'create',
            service_type: 'platform_apps',
            service_id: appId,
            service_name: request.name,
            after_state: {
              app_id: appId,
              name: request.name,
              framework: request.framework,
              repository_name: request.repository_name,
              branch: request.branch || 'main',
              deployment_url: deploymentResult.deployment_url,
              port: deploymentResult.port,
              instance_size: instanceSize,
              auto_deploy: request.auto_deploy || false,
              project_id: request.project_id,
            },
            ip_address: request.auditContext.ip_address,
            user_agent: request.auditContext.user_agent,
            request_id: request.auditContext.request_id,
            metadata: {
              initial_cost: INITIAL_COST,
              hourly_rate: HOURLY_RATE,
            },
          });
        } catch (auditErr) {
          console.warn('[PlatformAppService.createApp] Audit log failed:', auditErr);
        }
      }

      // 10. Send success notification
      try {
        await NotificationService.create(
          createServiceNotification({
            userId: request.userId,
            type: 'success',
            action: 'created',
            serviceType: 'platform_app',
            serviceName: request.name,
            serviceId: appId,
            metadata: {
              framework: request.framework,
              repository: request.repository_name,
              branch: request.branch || 'main',
            },
          })
        );
      } catch (notifErr) {
        console.error('[PlatformAppService.createApp] Notification failed:', notifErr);
      }

      // 11. Register webhook if auto_deploy enabled
      if (request.auto_deploy) {
        try {
          // providerToken was already resolved in step 5 — reuse it directly
          const webhookToken = providerToken;

          if (webhookToken) {
            const { WebhookManager } = await import('@/lib/services/webhook-manager');
            const webhookResult = await WebhookManager.registerWebhook({
              app_id: appId,
              provider: request.git_provider,
              repository_name: request.repository_name,
              access_token: webhookToken,
            });

            if (!webhookResult.success) {
              console.warn('[PlatformAppService.createApp] Webhook registration failed:', webhookResult.error);
              // Don't fail the creation, just log warning
            }
          } else {
            console.warn('[PlatformAppService.createApp] No token available for webhook registration');
          }
        } catch (webhookErr) {
          console.error('[PlatformAppService.createApp] Webhook setup error:', webhookErr);
        }
      }

      return {
        success: true,
        appId,
        deploymentUrl: deploymentResult.deployment_url,
        port: deploymentResult.port,
        billingInfo: {
          initialCost: INITIAL_COST,
          hourlyRate: HOURLY_RATE,
        },
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[PlatformAppService.createApp] Error:', errorMsg);

      // Send error notification
      try {
        await NotificationService.create(
          createServiceNotification({
            userId: request.userId,
            type: 'error',
            action: 'failed',
            serviceType: 'platform_app',
            serviceName: 'Application',
            error: errorMsg,
          })
        );
      } catch (notifError) {
        console.error('[PlatformAppService.createApp] Failed to create error notification:', notifError);
      }

      return {
        success: false,
        error: errorMsg,
        errorCode: "INTERNAL_ERROR",
      };
    }
  }

  /**
   * Get a single app by ID
   * - Fetches app from database
   * - Optionally syncs live status from Kubernetes
   * - Optionally includes environment variables
   * 
   * @throws Error if app not found or unauthorized
   */
  static async getApp(options: GetAppOptions) {
    const { appId, userId, syncStatus = false, includeEnvVars = false } = options;

    const result = await Platform_Apps.get(appId);
    
    if (!result.success || !result.data) {
      const error = new Error('App not found') as Error & { code?: string };
      error.code = 'NOT_FOUND';
      throw error;
    }

    const app = result.data;

    // Verify ownership
    if (app.user_id !== userId) {
      const error = new Error('Unauthorized') as Error & { code?: string };
      error.code = 'FORBIDDEN';
      throw error;
    }

    let syncedStatus = app.status;

    // Sync live status from K8s if requested
    if (syncStatus) {
      try {
        const syncResult = await AppStatusService.syncStatus(
          appId,
          app.name,
          app.status as "running" | "failed" | "pending" | "building" | "stopped"
        );
        syncedStatus = syncResult.currentStatus;
      } catch (syncErr) {
        console.warn('[PlatformAppService.getApp] Status sync failed:', syncErr);
        // Don't fail the request, use cached status
      }
    }

    // Get environment variables if requested
    let envVars = undefined;
    if (includeEnvVars) {
      try {
        envVars = await Platform_Apps.get_env_vars(appId);
      } catch (envErr) {
        console.warn('[PlatformAppService.getApp] Env vars fetch failed:', envErr);
      }
    }

    return {
      ...app,
      status: syncedStatus,
      env_vars: envVars,
    };
  }

  /**
   * List all apps for a user
   * - Fetches all apps owned by user
   * - Optionally checks rollback capability (requires deployment history lookup)
   */
  static async listApps(options: ListAppsOptions) {
    const { userId, includeRollbackInfo = false } = options;

    const apps = await Platform_Apps.list_by_owner(userId);

    if (!includeRollbackInfo) {
      return apps || [];
    }

    // Add rollback capability check
    const appsWithRollback = await Promise.all(
      (apps || []).map(async (app: { id: string; active_deployment_id?: string | null }) => {
        try {
          const prev = await Platform_App_Deployments.get_previous_successful(
            app.id,
            app.active_deployment_id ?? null
          );
          const canRollback = !!(prev.success && prev.data);
          return { ...app, can_rollback: canRollback };
        } catch (err) {
          console.warn(`[PlatformAppService.listApps] Rollback check failed for ${app.id}:`, err);
          return { ...app, can_rollback: false };
        }
      })
    );

    return appsWithRollback;
  }

  /**
   * Update safe app metadata fields.
   * Only supports fields that do not require redeployment.
   *
   * @throws Error if app not found, unauthorized, or update fails
   */
  static async updateAppMetadata(options: UpdateAppMetadataOptions) {
    const { appId, userId, name, autoDeploy } = options;

    const existing = await Platform_Apps.get(appId);
    if (!existing.success || !existing.data) {
      const error = new Error("App not found") as Error & { code?: string };
      error.code = "NOT_FOUND";
      throw error;
    }

    if (existing.data.user_id !== userId) {
      const error = new Error("Unauthorized") as Error & { code?: string };
      error.code = "FORBIDDEN";
      throw error;
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) {
      updateData.name = name;
    }
    if (autoDeploy !== undefined) {
      updateData.auto_deploy = autoDeploy;
    }

    const result = await Platform_Apps.update(appId, updateData);
    if (!result.success || !result.data) {
      const error = new Error("Failed to update app") as Error & {
        code?: string;
        details?: unknown;
      };
      error.code = "UPDATE_FAILED";
      error.details = result.error;
      throw error;
    }

    return result.data;
  }

  /**
   * Delete a platform app with full cleanup
   * - Deletes infrastructure via DeploymentService
   * - Closes billing (prorated)
   * - Adds project activity log
   * - Creates user notification
   * 
   * @throws Error if deletion fails
   */
  static async deleteApp(options: DeleteAppOptions): Promise<DeleteAppResult> {
    const { appId, userId, isAdmin = false, audit_context } = options;

    // Get app details before deletion for logging
    const appDetails = await Platform_Apps.get(appId);
    const appName = appDetails.success ? appDetails.data?.name : 'Unknown';
    const projectId = appDetails.success ? appDetails.data?.project_id : null;
    const repoName = appDetails.success ? appDetails.data?.repository_name : 'Unknown';

    try {
      // 1. Delete infrastructure using deployment service
      await DeploymentService.delete(appId, userId, isAdmin);

      // 2. Close active billing (prorated final charge)
      try {
        const billingResult = await Billing.close_active_service("platform_apps", {
          userId,
          serviceId: appId,
          failOnInsufficient: false, // Don't block deletion if user has no balance
        });
        console.log('[PlatformAppService.deleteApp] Billing closed:', {
          appId,
          charged: billingResult.charged,
          newBalance: billingResult.newBalance,
        });
      } catch (billingError) {
        console.warn('[PlatformAppService.deleteApp] Failed to close billing:', billingError);
        // Don't fail the deletion - billing cleanup can be handled separately
      }

      // 3. Add project activity log if project_id exists
      if (projectId) {
        try {
          await Projects.add_log({
            project_id: projectId,
            event: "Platform App Deleted",
            text: `Deleted app "${appName}" (${repoName})`,
          });
        } catch (logError) {
          console.warn('[PlatformAppService.deleteApp] Failed to add project log:', logError);
        }
      }

      // 4. Audit log
      if (audit_context) {
        try {
          await AuditLogService.create({
            user_id: userId,
            user_role: audit_context.user_role || (isAdmin ? 'admin' : 'user'),
            user_email: audit_context.user_email,
            action: 'delete',
            service_type: 'platform_apps',
            service_id: appId,
            service_name: appName,
            before_state: appDetails.success ? (appDetails.data as unknown as Record<string, unknown>) : undefined,
            ip_address: audit_context.ip_address,
            user_agent: audit_context.user_agent,
            request_id: audit_context.request_id,
          });
        } catch (auditErr) {
          console.warn('[PlatformAppService.deleteApp] Audit log failed:', auditErr);
        }
      }

      // 5. Create success notification
      try {
        await NotificationService.create(
          createServiceNotification({
            userId,
            type: 'success',
            action: 'deleted',
            serviceType: 'platform_app',
            serviceName: appName,
            serviceId: appId,
          })
        );
      } catch (notifError) {
        console.error('[PlatformAppService.deleteApp] Failed to create notification:', notifError);
      }

      return { success: true, appName };

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";

      // Create failure notification
      try {
        await NotificationService.create(
          createServiceNotification({
            userId,
            type: 'error',
            action: 'failed',
            serviceType: 'platform_app',
            serviceName: appName,
            error: `Deletion failed: ${errorMsg}`,
          })
        );
      } catch (notifError) {
        console.error('[PlatformAppService.deleteApp] Failed to create error notification:', notifError);
      }

      throw error; // Re-throw for caller to handle
    }
  }
}
