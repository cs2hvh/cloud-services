/**
 * Object Storage Integration Service
 * 
 * Business logic for linking/unlinking object storage buckets to apps.
 * This is the ONLY place where object storage integration logic lives.
 * 
 * Responsibilities:
 * - Validate ownership
 * - Generate environment variables (S3-compatible)
 * - Coordinate between ObjectSpaces, Platform_Apps, and ObjectStorage_Integrations
 * - Trigger redeployments when needed
 * 
 * @module lib/services/object-storage-integration
 */

// Import directly from files to avoid circular dependency issues
import { ObjectStorage_Integrations } from "@/lib/supabase/queries/object_storage_integrations";
import { Platform_Apps } from "@/lib/supabase/queries/platform_apps";
import { ObjectSpaces } from "@/lib/supabase/queries/object_spaces";
import { Projects } from "@/lib/supabase/queries/projects";
import { KubernetesInfoService } from "./kubernetes-info";
import { Encryption } from "@/config/functions";
import type { 
  ObjectSpaceBucket,
  EncryptedData 
} from "@/lib/supabase/types";

// ============================================
// REQUEST/RESPONSE TYPES
// ============================================

export interface StorageLinkRequest {
  app_id: string;
  bucket_id: string;  // This is object_spaces.id (UUID)
  user_id: string;
  force?: boolean;      // Overwrite existing env vars
  env_configs?: Array<{ originalKey: string; customKey: string; value?: string }>;  // Custom env configs
  env_prefix?: string;  // Fallback to prefix mode (for backward compatibility)
}

export interface StorageLinkResult {
  success: boolean;
  integration_id?: string;
  injected_vars?: string[];
  redeploy_triggered?: boolean;
  conflicts?: string[];
  error?: string;
  code?: string;
}

export interface StorageUnlinkRequest {
  app_id: string;
  bucket_id: string;
  user_id: string;
}

export interface StorageUnlinkResult {
  success: boolean;
  removed_vars?: string[];
  redeploy_triggered?: boolean;
  error?: string;
  code?: string;
}

export interface LinkedBucket {
  integration_id: string;
  bucket_id: string;
  bucket_name: string;
  region: string;
  status: string;
  env_prefix: string;
  injected_vars: string[];
  linked_at: string;
}

export interface GeneratedEnvVars {
  vars: Array<{ key: string; value: string }>;
  keys: string[];
}

// ============================================
// SERVICE CLASS
// ============================================

export class ObjectStorageIntegrationService {
  /**
   * Get encryption key from environment
   */
  private static getEncryptionKey(): string {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error("ENCRYPTION_KEY environment variable not configured");
    }
    return key;
  }

  /**
   * Decrypt a JSON-stringified encrypted field
   * Object storage stores encrypted data as JSON.stringify(EncryptedData)
   */
  private static decryptJsonField(field: string | null | undefined): string {
    if (!field) return "";
    
    try {
      // Try to parse as encrypted JSON
      const parsed = JSON.parse(field);
      
      // Check if it's an encrypted object
      if (parsed && typeof parsed === 'object' && 'encrypted' in parsed) {
        return Encryption.decrypt(parsed as EncryptedData, this.getEncryptionKey());
      }
      
      // Not encrypted, return as-is
      return field;
    } catch {
      // Not JSON, return as-is
      return field;
    }
  }

  /**
   * Generate environment variables from bucket info
   * 
   * @param bucket - The object storage bucket
   * @param prefix - Environment variable prefix (default: S3)
   * @returns Generated environment variables and their keys
   */
  static generateEnvVars(
    bucket: ObjectSpaceBucket,
    prefix: string = "S3"
  ): GeneratedEnvVars {
    const vars: Array<{ key: string; value: string }> = [];
    
    // Decrypt credentials
    const endpoint = this.decryptJsonField(bucket.endpoint);
    const accessKeyId = this.decryptJsonField(bucket.key_id);
    const secretAccessKey = this.decryptJsonField(bucket.secret_key);
    
    // S3-compatible env vars with custom prefix
    vars.push({ key: `${prefix}_BUCKET`, value: bucket.name });
    vars.push({ key: `${prefix}_BUCKET_NAME`, value: bucket.name });
    vars.push({ key: `${prefix}_ENDPOINT`, value: endpoint });
    vars.push({ key: `${prefix}_REGION`, value: bucket.region });
    vars.push({ key: `${prefix}_ACCESS_KEY_ID`, value: accessKeyId });
    vars.push({ key: `${prefix}_SECRET_ACCESS_KEY`, value: secretAccessKey });
    
    // AWS SDK compatible names (many libraries expect these)
    // Only add if prefix is not already AWS
    if (prefix !== "AWS") {
      vars.push({ key: `AWS_ACCESS_KEY_ID`, value: accessKeyId });
      vars.push({ key: `AWS_SECRET_ACCESS_KEY`, value: secretAccessKey });
      vars.push({ key: `AWS_REGION`, value: bucket.region });
      vars.push({ key: `AWS_ENDPOINT_URL`, value: endpoint });
    }

    return {
      vars,
      keys: vars.map(v => v.key),
    };
  }

  /**
   * Link an object storage bucket to an application
   * 
   * This is the main entry point for object storage integration.
   * It performs validation, creates env vars, and triggers redeploy.
   */
  static async link(request: StorageLinkRequest): Promise<StorageLinkResult> {
    const { app_id, bucket_id, user_id, force = false, env_configs, env_prefix = "S3" } = request;
    
    console.log(`[ObjectStorageIntegrationService] Linking bucket ${bucket_id} to app ${app_id}`);

    try {
      // ========================================
      // Step 1: Validate app exists and user owns it
      // ========================================
      const appResult = await Platform_Apps.get(app_id);
      if (!appResult.success || !appResult.data) {
        return { success: false, error: "App not found", code: "APP_NOT_FOUND" };
      }
      const app = appResult.data;
      
      if (app.user_id !== user_id) {
        return { success: false, error: "You don't own this app", code: "APP_NOT_OWNED" };
      }

      // ========================================
      // Step 2: Validate bucket exists and user owns it
      // ========================================
      const bucket = await ObjectSpaces.get_bucket_by_bucket_id(bucket_id, true);
      if (!bucket) {
        return { success: false, error: "Bucket not found", code: "BUCKET_NOT_FOUND" };
      }
      
      if (bucket.owner_id !== user_id) {
        return { success: false, error: "You don't own this bucket", code: "BUCKET_NOT_OWNED" };
      }

      // ========================================
      // Step 3: Check bucket is active and has credentials
      // ========================================
      if (bucket.status !== "active") {
        return { 
          success: false, 
          error: `Bucket is ${bucket.status}, must be active to link`,
          code: "BUCKET_NOT_READY" 
        };
      }

      if (!bucket.key_id || !bucket.secret_key) {
        return { 
          success: false, 
          error: "Bucket has no access credentials",
          code: "NO_CREDENTIALS" 
        };
      }

      // ========================================
      // Step 4: Check for existing integration
      // ========================================
      const existingResult = await ObjectStorage_Integrations.get_active(app_id, bucket_id);
      if (existingResult.success && existingResult.data) {
        // Allow reusing a failed integration
        if (existingResult.data.status === "failed") {
          await ObjectStorage_Integrations.delete(existingResult.data.id);
          console.log(`[ObjectStorageIntegrationService] Deleted failed integration, retrying...`);
        } else {
          return { 
            success: false, 
            error: "This bucket is already linked to this app",
            code: "ALREADY_LINKED" 
          };
        }
      }

      // ========================================
      // Step 5: Generate environment variables
      // ========================================
      let generated: GeneratedEnvVars;
      
      if (env_configs && env_configs.length > 0) {
        // Use custom env configurations
        const standardVars = this.generateEnvVars(bucket as ObjectSpaceBucket, env_prefix);
        const customVars: Array<{ key: string; value: string }> = [];
        const customKeys: string[] = [];

        // Map custom keys to actual values
        env_configs.forEach(config => {
          const standardVar = standardVars.vars.find(v => v.key === config.originalKey);
          if (standardVar) {
            customVars.push({
              key: config.customKey,
              value: standardVar.value,
            });
            customKeys.push(config.customKey);
          }
        });

        generated = {
          vars: customVars,
          keys: customKeys,
        };
      } else {
        // Fallback to prefix-based generation
        generated = this.generateEnvVars(bucket as ObjectSpaceBucket, env_prefix);
      }

      // ========================================
      // Step 6: Check for env var conflicts
      // ========================================
      const existingEnvVars = await Platform_Apps.get_env_vars(app_id);
      const existingKeys = new Set(existingEnvVars.map(ev => ev.key));
      const conflicts = generated.keys.filter(key => existingKeys.has(key));

      if (conflicts.length > 0 && !force) {
        return {
          success: false,
          error: "Environment variable conflict",
          code: "ENV_VAR_CONFLICT",
          conflicts,
        };
      }

      // ========================================
      // Step 7: Create integration record (status: pending)
      // ========================================
      const actualPrefix = env_configs && env_configs.length > 0 ? 'CUSTOM' : env_prefix;
      
      const integrationResult = await ObjectStorage_Integrations.create({
        object_space_id: bucket_id,
        platform_app_id: app_id,
        user_id,
        project_id: app.project_id || bucket.project_id || null,
        status: "pending",
        env_prefix: actualPrefix,
      });

      if (!integrationResult.success) {
        return { 
          success: false, 
          error: integrationResult.error || "Failed to create integration record",
          code: "DB_ERROR" 
        };
      }

      const integration = integrationResult.data!;

      // ========================================
      // Step 8: Inject env vars into app (Supabase)
      // ========================================
      const mergedVars = force 
        ? [...existingEnvVars.filter(ev => !conflicts.includes(ev.key)), ...generated.vars]
        : [...existingEnvVars, ...generated.vars];

      try {
        const setResult = await Platform_Apps.set_env_vars(app_id, mergedVars);
        if (!setResult.success) {
          throw new Error(setResult.error || "Failed to set env vars");
        }
      } catch (envError) {
        // Rollback: mark integration as failed
        await ObjectStorage_Integrations.mark_failed(
          integration.id, 
          `Failed to inject env vars: ${envError}`
        );
        return { 
          success: false, 
          error: `Failed to inject environment variables: ${envError}`,
          code: "ENV_INJECTION_FAILED" 
        };
      }

      // ========================================
      // Step 9: Update integration to linked
      // ========================================
      await ObjectStorage_Integrations.mark_linked(integration.id, generated.keys);

      // ========================================
      // Step 10: Update K8s Secret and trigger rolling restart
      // ========================================
      let redeployTriggered = false;
      if (app.status === "running" || app.status === "failed") {
        try {
          const restartResult = await KubernetesInfoService.updateEnvVarsAndRestart(
            app.name,
            mergedVars
          );
          redeployTriggered = restartResult.success;
          
          if (restartResult.success) {
            console.log(`[ObjectStorageIntegrationService] ✅ K8s Secret updated and restart triggered for ${app.name}`);
            
            // Sync status from K8s after restart
            const { AppStatusService } = await import('./app-status');
            const syncResult = await AppStatusService.syncAfterK8sOperation(app_id, app.name, 5000);
            if (syncResult.changed) {
              console.log(`[ObjectStorageIntegrationService] ✅ Status synced: ${syncResult.previousStatus} → ${syncResult.currentStatus}`);
            }
          } else {
            console.error(`[ObjectStorageIntegrationService] K8s update failed:`, restartResult.error);
          }
        } catch (deployError) {
          console.error(`[ObjectStorageIntegrationService] K8s update failed:`, deployError);
          // Don't fail the link - env vars saved to DB, will apply on next full deploy
        }
      }

      // ========================================
      // Step 11: Log activity
      // ========================================
      if (app.project_id) {
        await Projects.add_log({
          project_id: app.project_id,
          event: "Storage Linked",
          text: `Linked bucket "${bucket.name}" to app "${app.name}"`,
        });
      }

      console.log(`[ObjectStorageIntegrationService] ✅ Link successful: ${integration.id}`);

      return {
        success: true,
        integration_id: integration.id,
        injected_vars: generated.keys,
        redeploy_triggered: redeployTriggered,
      };

    } catch (error) {
      console.error("[ObjectStorageIntegrationService] Link error:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        code: "INTERNAL_ERROR" 
      };
    }
  }

  /**
   * Unlink an object storage bucket from an application
   * 
   * Removes injected env vars and triggers redeploy if app is running.
   */
  static async unlink(request: StorageUnlinkRequest): Promise<StorageUnlinkResult> {
    const { app_id, bucket_id, user_id } = request;
    
    console.log(`[ObjectStorageIntegrationService] Unlinking bucket ${bucket_id} from app ${app_id}`);

    try {
      // ========================================
      // Step 1: Find the active integration
      // ========================================
      const integrationResult = await ObjectStorage_Integrations.get_active(app_id, bucket_id);
      if (!integrationResult.success || !integrationResult.data) {
        return { 
          success: false, 
          error: "No active integration found",
          code: "NOT_LINKED" 
        };
      }
      const integration = integrationResult.data;

      // ========================================
      // Step 2: Verify ownership
      // ========================================
      if (integration.user_id !== user_id) {
        const appResult = await Platform_Apps.get(app_id);
        if (!appResult.success || appResult.data?.user_id !== user_id) {
          return { 
            success: false, 
            error: "You don't have permission to unlink",
            code: "PERMISSION_DENIED" 
          };
        }
      }

      // ========================================
      // Step 3: Get current app info
      // ========================================
      const appResult = await Platform_Apps.get(app_id);
      if (!appResult.success || !appResult.data) {
        return { success: false, error: "App not found", code: "APP_NOT_FOUND" };
      }
      const app = appResult.data;

      // ========================================
      // Step 4: Remove injected env vars
      // ========================================
      const keysToRemove = new Set(integration.injected_env_keys || []);
      const existingEnvVars = await Platform_Apps.get_env_vars(app_id);
      const filteredVars = existingEnvVars.filter(ev => !keysToRemove.has(ev.key));

      const setResult = await Platform_Apps.set_env_vars(app_id, filteredVars);
      if (!setResult.success) {
        return { 
          success: false, 
          error: "Failed to remove environment variables",
          code: "ENV_REMOVAL_FAILED" 
        };
      }

      // ========================================
      // Step 5: Mark integration as unlinked
      // ========================================
      await ObjectStorage_Integrations.mark_unlinked(integration.id, user_id);

      // ========================================
      // Step 6: Update K8s Secret and trigger rolling restart
      // ========================================
      let redeployTriggered = false;
      if (app.status === "running" || app.status === "failed") {
        try {
          const restartResult = await KubernetesInfoService.updateEnvVarsAndRestart(
            app.name,
            filteredVars
          );
          redeployTriggered = restartResult.success;
          
          if (restartResult.success) {
            console.log(`[ObjectStorageIntegrationService] ✅ K8s Secret updated and restart triggered for ${app.name}`);
            
            const { AppStatusService } = await import('./app-status');
            const syncResult = await AppStatusService.syncAfterK8sOperation(app_id, app.name, 5000);
            if (syncResult.changed) {
              console.log(`[ObjectStorageIntegrationService] ✅ Status synced: ${syncResult.previousStatus} → ${syncResult.currentStatus}`);
            }
          } else {
            console.error(`[ObjectStorageIntegrationService] K8s update failed:`, restartResult.error);
          }
        } catch (deployError) {
          console.error(`[ObjectStorageIntegrationService] K8s update failed:`, deployError);
        }
      }

      // ========================================
      // Step 7: Log activity
      // ========================================
      if (app.project_id) {
        await Projects.add_log({
          project_id: app.project_id,
          event: "Storage Unlinked",
          text: `Unlinked bucket from app "${app.name}"`,
        });
      }

      console.log(`[ObjectStorageIntegrationService] ✅ Unlink successful`);

      return {
        success: true,
        removed_vars: integration.injected_env_keys || [],
        redeploy_triggered: redeployTriggered,
      };

    } catch (error) {
      console.error("[ObjectStorageIntegrationService] Unlink error:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        code: "INTERNAL_ERROR" 
      };
    }
  }

  /**
   * Get all linked buckets for an app
   */
  static async getLinkedBuckets(app_id: string): Promise<{
    success: boolean;
    data?: LinkedBucket[];
    error?: string;
  }> {
    const result = await ObjectStorage_Integrations.get_by_app(app_id, false);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }

    const integrations = result.data || [];
    const linkedBuckets: LinkedBucket[] = [];

    for (const integration of integrations) {
      try {
        const bucket = await ObjectSpaces.get_bucket_by_bucket_id(integration.object_space_id, true);
        if (bucket) {
          linkedBuckets.push({
            integration_id: integration.id,
            bucket_id: integration.object_space_id,
            bucket_name: bucket.name,
            region: bucket.region,
            status: integration.status,
            env_prefix: integration.env_prefix,
            injected_vars: integration.injected_env_keys || [],
            linked_at: integration.created_at,
          });
        }
      } catch (err) {
        console.error(`[ObjectStorageIntegrationService] Error fetching bucket ${integration.object_space_id}:`, err);
      }
    }

    return { success: true, data: linkedBuckets };
  }

  /**
   * Get all apps linked to a bucket
   */
  static async getLinkedApps(bucket_id: string): Promise<{
    success: boolean;
    data?: Array<{
      integration_id: string;
      app_id: string;
      app_name: string;
      status: string;
      linked_at: string;
    }>;
    error?: string;
  }> {
    const result = await ObjectStorage_Integrations.get_by_bucket(bucket_id, false);
    
    if (!result.success) {
      return { success: false, error: result.error };
    }

    const integrations = result.data || [];
    const linkedApps = [];

    for (const integration of integrations) {
      try {
        const appResult = await Platform_Apps.get(integration.platform_app_id);
        if (appResult.success && appResult.data) {
          const app = appResult.data;
          linkedApps.push({
            integration_id: integration.id,
            app_id: integration.platform_app_id,
            app_name: app.name,
            status: integration.status,
            linked_at: integration.created_at,
          });
        }
      } catch (err) {
        console.error(`[ObjectStorageIntegrationService] Error fetching app ${integration.platform_app_id}:`, err);
      }
    }

    return { success: true, data: linkedApps };
  }
}
