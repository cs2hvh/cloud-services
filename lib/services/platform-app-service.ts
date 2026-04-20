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
import { ensureBalance } from "@/config/billing-flow";
import { PlatformAppCreateIdempotencyService } from "@/lib/services/platform-app-create-idempotency";
import { DatabaseIntegrationService } from "@/lib/services/database-integration";
import { ObjectStorageIntegrationService } from "@/lib/services/object-storage-integration";

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
  idempotencyKey?: string | null;
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
  warning?: string;
}

export interface ResizeAppOptions {
  appId: string;
  userId: string;
  newSize: 'small' | 'medium' | 'large';
  audit_context?: {
    ip_address?: string;
    user_agent?: string;
    request_id?: string;
    user_email?: string;
    user_role?: 'user' | 'admin';
  };
}

export interface ResizeAppResult {
  success: boolean;
  appId?: string;
  appName?: string;
  oldSize?: string;
  newSize?: string;
  buildNumber?: number;
  operationId?: string;
  error?: string;
  errorCode?: string;
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

export interface DeploymentPresentation {
  can_rollback: boolean;
  serving_build_number: number | null;
  last_operation_build_number: number | null;
  last_operation_trigger: string | null;
  rollback_target_build_number: number | null;
  rollback_target_commit_sha: string | null;
}

const DEFAULT_DEPLOYMENT_PRESENTATION: DeploymentPresentation = {
  can_rollback: false,
  serving_build_number: null,
  last_operation_build_number: null,
  last_operation_trigger: null,
  rollback_target_build_number: null,
  rollback_target_commit_sha: null,
};

export interface UpdateAppMetadataOptions {
  appId: string;
  userId: string;
  name?: string;
  autoDeploy?: boolean;
}

type GitProvider = CreateAppRequest["git_provider"];

export class PlatformAppService {
  static async getDeploymentPresentation(options: {
    appId: string;
    activeDeploymentId?: string | null;
  }): Promise<DeploymentPresentation> {
    const { appId, activeDeploymentId = null } = options;

    try {
      const ctx = await Platform_App_Deployments.get_rollback_context(appId, activeDeploymentId);

      if (!ctx.success) {
        console.warn(`[PlatformAppService.getDeploymentPresentation] Failed for ${appId}:`, ctx.error);
        return DEFAULT_DEPLOYMENT_PRESENTATION;
      }

      const { serving_release, rollback_target, latest_operation, can_rollback } = ctx.data;

      return {
        can_rollback,
        serving_build_number:
          typeof serving_release?.build_number === "number" ? serving_release.build_number : null,
        last_operation_build_number:
          typeof latest_operation?.build_number === "number"
            ? latest_operation.build_number
            : typeof (latest_operation as { rollback_target_build_number?: unknown } | null)
                ?.rollback_target_build_number === "number"
              ? ((latest_operation as { rollback_target_build_number?: number }).rollback_target_build_number ?? null)
              : null,
        last_operation_trigger:
          typeof latest_operation?.trigger === "string" ? latest_operation.trigger : null,
        rollback_target_build_number:
          can_rollback && typeof rollback_target?.build_number === "number"
            ? rollback_target.build_number
            : null,
        rollback_target_commit_sha:
          can_rollback && typeof rollback_target?.commit_sha === "string"
            ? rollback_target.commit_sha
            : null,
      };
    } catch (err) {
      console.warn(`[PlatformAppService.getDeploymentPresentation] Failed for ${appId}:`, err);
      return DEFAULT_DEPLOYMENT_PRESENTATION;
    }
  }

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
    const idempotency = new PlatformAppCreateIdempotencyService();
    const operation = await idempotency.begin<CreateAppResult>({
      userId: request.userId,
      idempotencyKey: request.idempotencyKey ?? null,
      shouldPersistResult: (result) => result.success,
      execute: async () => this.createAppUnchecked(request),
    });

    if (operation.kind === "completed") {
      return operation.result;
    }

    if (operation.kind === "in_progress") {
      return {
        success: false,
        error: `App creation is already in progress. Retry after ${operation.retryAfter}s.`,
        errorCode: "OPERATION_IN_PROGRESS",
      };
    }

    return operation.execute();
  }

  private static async createAppUnchecked(request: CreateAppRequest): Promise<CreateAppResult> {
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
      const knownProviders: GitProvider[] = ["github", "gitlab", "bitbucket"];
      const providerToken = await this.resolveProviderToken(request.git_provider, request.userId);

      if (!providerToken && knownProviders.includes(request.git_provider)) {
        console.warn(`[PlatformAppService] ⚠️ No valid ${request.git_provider} token — blocking deployment.`);
        return {
          success: false,
          error: `Your ${request.git_provider} account is not connected or the access token has expired. Please reconnect it in Account Settings before deploying.`,
          errorCode: "GIT_TOKEN_MISSING",
        };
      }

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
        idempotencyKey: request.idempotencyKey ?? null,
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

      // 8. Create audit log
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

      // 9. Send creation/start notification.
      // The app record now exists, but the initial deployment may still be building.
      // Keep the user-facing message truthful and avoid implying the first release
      // is already healthy or billable.
      try {
        await NotificationService.create(
          {
            user_id: request.userId,
            type: 'info',
            title: 'Application Deployment Started',
            message: `Application "${request.name}" has been created and the initial deployment is in progress. Billing will activate after the first successful deployment.`,
            service_type: 'platform_app',
            service_id: appId,
            action: 'created',
            metadata: {
              serviceName: request.name,
              framework: request.framework,
              repository: request.repository_name,
              branch: request.branch || 'main',
            },
          }
        );
      } catch (notifErr) {
        console.error('[PlatformAppService.createApp] Notification failed:', notifErr);
      }

      // 10. Register webhook if auto_deploy enabled
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
        const deploymentPresentation = await PlatformAppService.getDeploymentPresentation({
          appId: app.id,
          activeDeploymentId: app.active_deployment_id ?? null,
        });
        return { ...app, ...deploymentPresentation };
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
    let billingWarning: string | undefined;

    try {
      // 1. Unlink all database and object-storage integrations before the app record is deleted
      await Promise.all([
        DatabaseIntegrationService.unlinkAllFromApp(appId, userId).catch((err) => {
          console.error(`[PlatformAppService] Failed to unlink database integrations for app ${appId}:`, err);
        }),
        ObjectStorageIntegrationService.unlinkAllFromApp(appId, userId).catch((err) => {
          console.error(`[PlatformAppService] Failed to unlink storage integrations for app ${appId}:`, err);
        }),
      ]);

      // 2. Delete infrastructure using deployment service
      const deploymentDeletion = await DeploymentService.delete(appId, userId, isAdmin);
      // 3. Close active billing (prorated final charge)
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
        billingWarning =
          billingError instanceof Error
            ? billingError.message
            : String(billingError);
      }

      // 4. Add project activity log if project_id exists
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

      // 5. Audit log
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

      // 6. Create success notification
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

      const warning = [deploymentDeletion.warning, billingWarning].filter(Boolean).join("; ") || undefined;
      return { success: true, appName, warning };

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

  /**
   * Resize a platform app (upsize only)
   * - Validates ownership and upsize direction
   * - Updates billing rate
   * - Creates audit log
   */
  static async resizeApp(options: ResizeAppOptions): Promise<ResizeAppResult> {
    const { appId, userId, newSize, audit_context } = options;

    // Get the app
    const appResult = await Platform_Apps.get(appId);
    if (!appResult.success || !appResult.data) {
      const error = new Error('App not found') as Error & { code?: string };
      error.code = 'NOT_FOUND';
      throw error;
    }

    const app = appResult.data;

    // Verify ownership
    if (app.user_id !== userId) {
      const error = new Error('Unauthorized') as Error & { code?: string };
      error.code = 'FORBIDDEN';
      throw error;
    }

    const currentSize = (app.size || 'small') as 'small' | 'medium' | 'large';
    const SIZE_ORDER: Record<string, number> = {
      small: 1,
      medium: 2,
      large: 3,
    };

    // Validate upsize only
    if (SIZE_ORDER[newSize] <= SIZE_ORDER[currentSize]) {
      const error = new Error(
        `Cannot resize from ${currentSize} to ${newSize}. Only upsizing is allowed.`
      ) as Error & { code?: string };
      error.code = 'INVALID_RESIZE';
      throw error;
    }

    // Update billing rate (non-fatal)
    try {
      const { hourlyRate } = await getRatesForPlatformApp(newSize);
      await Billing.update_active_platform_app_rate({ serviceId: appId, newHourlyRate: hourlyRate });
      console.log(`[PlatformAppService.resizeApp] Billing rate updated for app ${appId}`);
    } catch (billingErr) {
      console.warn(`[PlatformAppService.resizeApp] Billing rate update failed for app ${appId}:`, billingErr);
    }

    // Create audit log
    if (audit_context) {
      try {
        await AuditLogService.create({
          user_id: userId,
          user_role: audit_context.user_role || 'user',
          user_email: audit_context.user_email,
          action: 'update',
          service_type: 'platform_apps',
          service_id: appId,
          service_name: app.name,
          after_state: { ...app, size: newSize } as Record<string, unknown>,
          ip_address: audit_context.ip_address,
          user_agent: audit_context.user_agent,
          request_id: audit_context.request_id,
          metadata: {
            old_size: currentSize,
            new_size: newSize,
          },
        });
      } catch (auditErr) {
        console.warn('[PlatformAppService.resizeApp] Audit log failed:', auditErr);
      }
    }

    return {
      success: true,
      appId,
      appName: app.name,
      oldSize: currentSize,
      newSize,
    };
  }

  /**
   * Check whether the user's balance covers the target resize tier's hourly rate.
   * Returns a result object — never throws.
   */
  static async checkBalanceForResize(
    userId: string,
    newSize: 'small' | 'medium' | 'large'
  ): Promise<{ ok: boolean; balance?: number; required?: number }> {
    let hourlyRate: number;
    try {
      ({ hourlyRate } = await getRatesForPlatformApp(newSize));
    } catch {
      // Pricing data is corrupt (e.g. negative price guard). Block resize rather than charging wrong rate.
      console.error(`[PlatformAppService.checkBalanceForResize] Failed to get rates for size "${newSize}"`);
      return { ok: false };
    }
    if (hourlyRate <= 0) return { ok: true };
    const check = await ensureBalance(userId, hourlyRate);
    return { ok: check.ok, balance: check.balance ?? 0, required: hourlyRate };
  }

}
