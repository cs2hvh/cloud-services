/**
 * Database Integration Service
 * 
 * Business logic for linking/unlinking databases to apps.
 * This is the ONLY place where integration logic lives.
 * 
 * Responsibilities:
 * - Validate ownership
 * - Generate environment variables
 * - Coordinate between Database_Clusters, Platform_Apps, and Database_Integrations
 * - Trigger redeployments when needed
 * 
 * @module lib/services/database-integration
 */

import { 
  Database_Integrations, 
  Platform_Apps, 
  Database_Clusters, 
  Projects 
} from "@/lib/supabase/queries";
import { JenkinsService } from "./jenkins";
import { BuildPollingService } from "./build-polling";
import { Encryption } from "@/config/functions";
import type { 
  Database_Connection, 
  GeneratedEnvVars,
  EncryptedData 
} from "@/lib/supabase/types";

// ============================================
// REQUEST/RESPONSE TYPES
// ============================================

export interface LinkRequest {
  app_id: string;
  database_id: string;  // This is cluster_id, not UUID
  user_id: string;
  force?: boolean;      // Overwrite existing env vars
  env_prefix?: string;  // Custom prefix (default: DATABASE)
  env_mapping?: Record<string, string>;  // Custom key name mapping (e.g., { "DATABASE_URL": "MY_DB_URL" })
}

export interface LinkResult {
  success: boolean;
  integration_id?: string;
  injected_vars?: string[];
  redeploy_triggered?: boolean;
  conflicts?: string[];
  error?: string;
  code?: string;
}

export interface UnlinkRequest {
  app_id: string;
  database_id: string;
  user_id: string;
}

export interface UnlinkResult {
  success: boolean;
  removed_vars?: string[];
  redeploy_triggered?: boolean;
  error?: string;
  code?: string;
}

export interface LinkedDatabase {
  integration_id: string;
  database_cluster_id: string;
  database_name?: string;
  engine?: string;
  status: string;
  injected_env_keys: string[];
  linked_at: string;
}

export interface LinkedApp {
  integration_id: string;
  platform_app_id: string;
  app_name?: string;
  status: string;
  injected_env_keys: string[];
  linked_at: string;
}

// ============================================
// SERVICE CLASS
// ============================================

export class DatabaseIntegrationService {
  
  /**
   * Get the encryption key from environment
   */
  private static getEncryptionKey(): string {
    const key = process.env.ENCRYPTION_KEY || process.env.DB_ENCRYPTION_KEY;
    if (!key) {
      throw new Error("Encryption key not configured");
    }
    return key;
  }

  /**
   * Decrypt a value if it's encrypted
   */
  private static decryptIfNeeded(value: string | EncryptedData | undefined): string {
    if (!value) return "";
    
    if (typeof value === "string") {
      return value;
    }
    
    // It's encrypted - has 'encrypted', 'iv', 'tag', 'salt' fields
    try {
      return Encryption.decrypt(value, this.getEncryptionKey());
    } catch (err) {
      console.error("[DatabaseIntegrationService] Decryption failed:", err);
      return "";
    }
  }

  /**
   * Generate environment variables from database connection
   * 
   * @param connection - The database connection object
   * @param engine - Database engine type (pg, mysql, mongodb, etc.)
   * @param prefix - Environment variable prefix (default: DATABASE)
   * @returns Generated environment variables and their keys
   */
  /**
   * Extract credentials from a database URI
   * Handles mongodb://, mongodb+srv://, postgresql://, mysql:// formats
   * URI format: protocol://user:password@host:port/database
   */
  private static extractCredentialsFromUri(uri: string): { user?: string; password?: string; host?: string; port?: number; database?: string } {
    if (!uri) return {};
    
    try {
      // Match pattern: protocol://user:password@host:port/database
      // Also handles mongodb+srv:// which doesn't have port
      const match = uri.match(/^([^:]+):\/\/([^:]+):([^@]+)@([^:\/]+)(?::(\d+))?\/([^?]+)/);
      
      if (match) {
        return {
          user: decodeURIComponent(match[2]),
          password: decodeURIComponent(match[3]),
          host: match[4],
          port: match[5] ? parseInt(match[5], 10) : undefined,
          database: match[6],
        };
      }
    } catch (err) {
      console.error("[DatabaseIntegrationService] Failed to extract credentials from URI:", err);
    }
    
    return {};
  }

  static generateEnvVars(
    connection: Database_Connection,
    engine: string,
    prefix: string = "DATABASE"
  ): GeneratedEnvVars {
    const vars: Array<{ key: string; value: string }> = [];
    
    // Decrypt sensitive fields
    const host = this.decryptIfNeeded(connection.host);
    let password = this.decryptIfNeeded(connection.password);
    const user = this.decryptIfNeeded(connection.user);
    const database = this.decryptIfNeeded(connection.database);
    const uri = this.decryptIfNeeded(connection.uri);
    const port = typeof connection.port === 'number' ? connection.port : parseInt(String(connection.port), 10) || 5432;
    
    // For MongoDB and other databases: If password is empty but URI exists,
    // try to extract password from URI (DigitalOcean may only provide credentials in URI)
    if (!password && uri) {
      const extracted = this.extractCredentialsFromUri(uri);
      if (extracted.password) {
        password = extracted.password;
        console.log(`[DatabaseIntegrationService] Extracted password from URI for ${engine}`);
      }
    }
    
    // Warn if password is still empty (this will cause connection errors)
    if (!password) {
      console.warn(`[DatabaseIntegrationService] WARNING: Password is empty for ${engine} database. Connection may fail.`);
    }
    
    // Build connection URL based on engine
    let connectionUrl = connection.uri;
    if (!connectionUrl) {
      // Build it manually if URI not provided
      const protocol = engine === "mongodb" ? "mongodb" : 
                       engine === "mysql" ? "mysql" : 
                       engine === "pg" ? "postgresql" : 
                       engine === "kafka" ? "kafka" : engine;
      
      connectionUrl = `${protocol}://${connection.user}:${password}@${host}:${connection.port}/${connection.database}`;
      
      if (connection.ssl) {
        connectionUrl += "?sslmode=require";
      }
    }

    // Primary URL variable - different key name for MongoDB
    const urlKey = engine === "mongodb" ? `${prefix}_URI` : `${prefix}_URL`;
    vars.push({ key: urlKey, value: connectionUrl });

    // Individual components
    vars.push({ key: `${prefix}_HOST`, value: host });
    vars.push({ key: `${prefix}_PORT`, value: String(connection.port) });
    vars.push({ key: `${prefix}_USER`, value: connection.user });
    vars.push({ key: `${prefix}_PASSWORD`, value: password });
    vars.push({ key: `${prefix}_NAME`, value: connection.database });
    
    if (connection.ssl) {
      vars.push({ key: `${prefix}_SSL`, value: "true" });
    }

    return {
      vars,
      keys: vars.map(v => v.key),
    };
  }

  /**
   * Link a database to an application
   * 
   * This is the main entry point for database integration.
   * It performs validation, creates env vars, and triggers redeploy.
   */
  static async link(request: LinkRequest): Promise<LinkResult> {
    const { app_id, database_id, user_id, force = false, env_prefix = "DATABASE", env_mapping } = request;
    
    console.log(`[DatabaseIntegrationService] Linking database ${database_id} to app ${app_id}`);

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
      // Step 2: Validate database exists and user owns it
      // ========================================
      const dbResult = await Database_Clusters.read(database_id);
      if (!dbResult.success || !dbResult.data) {
        return { success: false, error: "Database not found", code: "DATABASE_NOT_FOUND" };
      }
      const database = dbResult.data;
      
      if (database.owner_id !== user_id) {
        return { success: false, error: "You don't own this database", code: "DATABASE_NOT_OWNED" };
      }

      // ========================================
      // Step 3: Check database is online
      // ========================================
      if (database.status !== "online") {
        return { 
          success: false, 
          error: `Database is ${database.status}, must be online to link`,
          code: "DATABASE_NOT_READY" 
        };
      }

      // ========================================
      // Step 4: Check for existing integration
      // ========================================
      const existingResult = await Database_Integrations.get_active(app_id, database_id);
      if (existingResult.success && existingResult.data) {
        // Allow reusing a failed integration
        if (existingResult.data.status === "failed") {
          // Delete the failed record so we can create a new one
          await Database_Integrations.delete(existingResult.data.id);
          console.log(`[DatabaseIntegrationService] Deleted failed integration, retrying...`);
        } else {
          return { 
            success: false, 
            error: "This database is already linked to this app",
            code: "ALREADY_LINKED" 
          };
        }
      }

      // ========================================
      // Step 5: Generate environment variables
      // ========================================
      const connection = database.public_connection;
      if (!connection) {
        return { 
          success: false, 
          error: "Database has no connection information",
          code: "NO_CONNECTION_INFO" 
        };
      }

      let generated = this.generateEnvVars(
        connection as Database_Connection, 
        database.engine, 
        env_prefix
      );

      // Apply custom key mapping if provided
      if (env_mapping && Object.keys(env_mapping).length > 0) {
        generated = {
          vars: generated.vars.map(v => ({
            key: env_mapping[v.key] || v.key,
            value: v.value,
          })),
          keys: generated.vars.map(v => env_mapping[v.key] || v.key),
        };
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
      const integrationResult = await Database_Integrations.create({
        database_cluster_id: database_id,
        platform_app_id: app_id,
        user_id,
        project_id: app.project_id || database.project_id || null,
        status: "pending",
        env_prefix,
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
      // Step 8: Inject env vars into app
      // ========================================
      try {
        // Merge with existing (filter out conflicts if force=true)
        const mergedVars = force 
          ? [...existingEnvVars.filter(ev => !conflicts.includes(ev.key)), ...generated.vars]
          : [...existingEnvVars, ...generated.vars];

        const setResult = await Platform_Apps.set_env_vars(app_id, mergedVars);
        if (!setResult.success) {
          throw new Error(setResult.error || "Failed to set env vars");
        }
      } catch (envError) {
        // Rollback: mark integration as failed
        await Database_Integrations.mark_failed(
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
      await Database_Integrations.mark_linked(integration.id, generated.keys);

      // ========================================
      // Step 10: Trigger redeploy if app is running
      // ========================================
      let redeployTriggered = false;
      if (app.status === "running") {
        try {
          const buildNumber = await JenkinsService.triggerBuild(app.name);
          BuildPollingService.startPolling({
            appId: app_id,
            appName: app.name,
            buildNumber,
            trigger: "manual", // Using 'manual' as closest match
          });
          redeployTriggered = true;
          console.log(`[DatabaseIntegrationService] Redeploy triggered: build #${buildNumber}`);
        } catch (deployError) {
          console.error(`[DatabaseIntegrationService] Redeploy failed:`, deployError);
          // Don't fail the link - env vars are saved, will apply on next deploy
        }
      }

      // ========================================
      // Step 11: Log activity
      // ========================================
      if (app.project_id) {
        await Projects.add_log({
          project_id: app.project_id,
          event: "Database Linked",
          text: `Linked database "${database.name}" to app "${app.name}"`,
        });
      }

      console.log(`[DatabaseIntegrationService] ✅ Link successful: ${integration.id}`);

      return {
        success: true,
        integration_id: integration.id,
        injected_vars: generated.keys,
        redeploy_triggered: redeployTriggered,
      };

    } catch (error) {
      console.error("[DatabaseIntegrationService] Link error:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        code: "INTERNAL_ERROR" 
      };
    }
  }

  /**
   * Unlink a database from an application
   * 
   * Removes injected env vars and triggers redeploy if app is running.
   */
  static async unlink(request: UnlinkRequest): Promise<UnlinkResult> {
    const { app_id, database_id, user_id } = request;
    
    console.log(`[DatabaseIntegrationService] Unlinking database ${database_id} from app ${app_id}`);

    try {
      // ========================================
      // Step 1: Find the active integration
      // ========================================
      const integrationResult = await Database_Integrations.get_active(app_id, database_id);
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
        // Also check if user owns the app
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
      await Database_Integrations.mark_unlinked(integration.id, user_id);

      // ========================================
      // Step 6: Trigger redeploy if app is running
      // ========================================
      let redeployTriggered = false;
      if (app.status === "running") {
        try {
          const buildNumber = await JenkinsService.triggerBuild(app.name);
          BuildPollingService.startPolling({
            appId: app_id,
            appName: app.name,
            buildNumber,
            trigger: "manual",
          });
          redeployTriggered = true;
          console.log(`[DatabaseIntegrationService] Redeploy triggered: build #${buildNumber}`);
        } catch (deployError) {
          console.error(`[DatabaseIntegrationService] Redeploy failed:`, deployError);
          // Don't fail - env vars are removed, will apply on next deploy
        }
      }

      // ========================================
      // Step 7: Log activity
      // ========================================
      if (app.project_id) {
        await Projects.add_log({
          project_id: app.project_id,
          event: "Database Unlinked",
          text: `Unlinked database from app "${app.name}"`,
        });
      }

      console.log(`[DatabaseIntegrationService] ✅ Unlink successful`);

      return {
        success: true,
        removed_vars: integration.injected_env_keys || [],
        redeploy_triggered: redeployTriggered,
      };

    } catch (error) {
      console.error("[DatabaseIntegrationService] Unlink error:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        code: "INTERNAL_ERROR" 
      };
    }
  }

  /**
   * Get all linked databases for an app
   */
  static async getLinkedDatabases(app_id: string): Promise<{
    success: boolean;
    data?: LinkedDatabase[];
    error?: string;
  }> {
    const result = await Database_Integrations.get_by_app(app_id, false);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Enrich with database info
    const linkedDatabases: LinkedDatabase[] = [];
    for (const integration of result.data || []) {
      const dbResult = await Database_Clusters.read(integration.database_cluster_id);
      linkedDatabases.push({
        integration_id: integration.id,
        database_cluster_id: integration.database_cluster_id,
        database_name: dbResult.data?.name,
        engine: dbResult.data?.engine,
        status: integration.status,
        injected_env_keys: integration.injected_env_keys || [],
        linked_at: integration.created_at,
      });
    }

    return { success: true, data: linkedDatabases };
  }

  /**
   * Get all apps linked to a database
   */
  static async getLinkedApps(database_id: string): Promise<{
    success: boolean;
    data?: LinkedApp[];
    error?: string;
  }> {
    const result = await Database_Integrations.get_by_database(database_id, false);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    // Enrich with app info
    const linkedApps: LinkedApp[] = [];
    for (const integration of result.data || []) {
      const appResult = await Platform_Apps.get(integration.platform_app_id);
      linkedApps.push({
        integration_id: integration.id,
        platform_app_id: integration.platform_app_id,
        app_name: appResult.data?.name,
        status: integration.status,
        injected_env_keys: integration.injected_env_keys || [],
        linked_at: integration.created_at,
      });
    }

    return { success: true, data: linkedApps };
  }

  /**
   * Check if database can be deleted (no active links)
   */
  static async canDeleteDatabase(database_id: string): Promise<{
    canDelete: boolean;
    linkedApps: number;
    linkedAppNames?: string[];
  }> {
    const result = await this.getLinkedApps(database_id);
    const linkedApps = result.data || [];
    
    return {
      canDelete: linkedApps.length === 0,
      linkedApps: linkedApps.length,
      linkedAppNames: linkedApps.map(app => app.app_name || app.platform_app_id),
    };
  }

  /**
   * Force unlink all apps from a database (for force delete)
   * 
   * WARNING: This is a destructive operation. Use with caution.
   */
  static async unlinkAllFromDatabase(database_id: string, user_id: string): Promise<{
    success: boolean;
    unlinked_count: number;
    failed_unlinks?: string[];
  }> {
    const linkedResult = await Database_Integrations.get_by_database(database_id, false);
    if (!linkedResult.success) {
      return { success: false, unlinked_count: 0 };
    }

    let unlinkedCount = 0;
    const failedUnlinks: string[] = [];

    for (const integration of linkedResult.data || []) {
      const result = await this.unlink({
        app_id: integration.platform_app_id,
        database_id,
        user_id,
      });
      
      if (result.success) {
        unlinkedCount++;
      } else {
        failedUnlinks.push(integration.platform_app_id);
      }
    }

    return { 
      success: failedUnlinks.length === 0, 
      unlinked_count: unlinkedCount,
      failed_unlinks: failedUnlinks.length > 0 ? failedUnlinks : undefined,
    };
  }
}
