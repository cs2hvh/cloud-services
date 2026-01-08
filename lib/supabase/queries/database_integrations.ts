/**
 * Database Integrations Query Module
 * 
 * Handles all database operations for the database_integrations table.
 * This module is ONLY responsible for data access - no business logic.
 * 
 * @module lib/supabase/queries/database_integrations
 */

import { createServiceClient, createSSRClient } from "../server";
import type { 
  DatabaseIntegration, 
  DatabaseIntegrationInsert, 
  DatabaseIntegrationUpdate 
} from "../types";

/**
 * Helper function for consistent error logging
 */
function logError(method: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Database_Integrations.${method}] Error:`, message);
}

export const Database_Integrations = {
  /**
   * Create a new integration record
   * 
   * @param payload - The integration data to insert
   * @returns Result with the created integration or error
   */
  create: async (payload: DatabaseIntegrationInsert) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("database_integrations")
        .insert(payload)
        .select()
        .single();

      if (error) {
        logError("create", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data as DatabaseIntegration };
    } catch (err) {
      logError("create", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Get integration by ID
   * 
   * @param id - The integration UUID
   * @returns Result with the integration or error
   */
  get: async (id: string) => {
    try {
      const supabase = await createSSRClient();
      const { data, error } = await supabase
        .from("database_integrations")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        logError("get", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data as DatabaseIntegration };
    } catch (err) {
      logError("get", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Get active integration for app + database combo
   * Returns the linked/pending record if exists
   * 
   * @param platform_app_id - The app UUID
   * @param database_cluster_id - The database cluster ID
   * @returns Result with the active integration or null
   */
  get_active: async (platform_app_id: string, database_cluster_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("database_integrations")
        .select("*")
        .eq("platform_app_id", platform_app_id)
        .eq("database_cluster_id", database_cluster_id)
        .in("status", ["pending", "linked"])
        .maybeSingle();

      if (error) {
        logError("get_active", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data as DatabaseIntegration | null };
    } catch (err) {
      logError("get_active", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Get all integrations for an app
   * 
   * @param platform_app_id - The app UUID
   * @param include_unlinked - Whether to include unlinked integrations (default: false)
   * @returns Result with array of integrations
   */
  get_by_app: async (platform_app_id: string, include_unlinked = false) => {
    try {
      const supabase = await createSSRClient();
      let query = supabase
        .from("database_integrations")
        .select("*")
        .eq("platform_app_id", platform_app_id);

      if (!include_unlinked) {
        query = query.in("status", ["pending", "linked"]);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        logError("get_by_app", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: (data || []) as DatabaseIntegration[] };
    } catch (err) {
      logError("get_by_app", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Get all integrations for a database
   * 
   * @param database_cluster_id - The database cluster ID
   * @param include_unlinked - Whether to include unlinked integrations (default: false)
   * @returns Result with array of integrations
   */
  get_by_database: async (database_cluster_id: string, include_unlinked = false) => {
    try {
      const supabase = await createServiceClient();
      let query = supabase
        .from("database_integrations")
        .select("*")
        .eq("database_cluster_id", database_cluster_id);

      if (!include_unlinked) {
        query = query.in("status", ["pending", "linked"]);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        logError("get_by_database", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: (data || []) as DatabaseIntegration[] };
    } catch (err) {
      logError("get_by_database", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Get all integrations for a user
   * 
   * @param user_id - The user UUID
   * @param include_unlinked - Whether to include unlinked integrations (default: false)
   * @returns Result with array of integrations
   */
  get_by_user: async (user_id: string, include_unlinked = false) => {
    try {
      const supabase = await createSSRClient();
      let query = supabase
        .from("database_integrations")
        .select("*")
        .eq("user_id", user_id);

      if (!include_unlinked) {
        query = query.in("status", ["pending", "linked"]);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        logError("get_by_user", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: (data || []) as DatabaseIntegration[] };
    } catch (err) {
      logError("get_by_user", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Update an integration record
   * 
   * @param id - The integration UUID
   * @param updates - Fields to update
   * @returns Result with updated integration or error
   */
  update: async (id: string, updates: DatabaseIntegrationUpdate) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("database_integrations")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        logError("update", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data as DatabaseIntegration };
    } catch (err) {
      logError("update", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Mark integration as linked with injected keys
   * 
   * @param id - The integration UUID
   * @param injected_env_keys - Array of env var keys that were injected
   * @returns Result with updated integration
   */
  mark_linked: async (id: string, injected_env_keys: string[]) => {
    return Database_Integrations.update(id, {
      status: "linked",
      injected_env_keys,
    });
  },

  /**
   * Mark integration as unlinked (soft delete)
   * 
   * @param id - The integration UUID
   * @param unlinked_by - User ID who performed the unlink
   * @returns Result with updated integration
   */
  mark_unlinked: async (id: string, unlinked_by: string) => {
    return Database_Integrations.update(id, {
      status: "unlinked",
      unlinked_at: new Date().toISOString(),
      unlinked_by,
    });
  },

  /**
   * Mark integration as failed with error message
   * 
   * @param id - The integration UUID
   * @param error_message - Error description
   * @returns Result with updated integration
   */
  mark_failed: async (id: string, error_message: string) => {
    return Database_Integrations.update(id, {
      status: "failed",
      error_message,
    });
  },

  /**
   * Hard delete an integration (use sparingly)
   * Typically used to clean up failed integrations before retry
   * 
   * @param id - The integration UUID
   * @returns Result with success status
   */
  delete: async (id: string) => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase
        .from("database_integrations")
        .delete()
        .eq("id", id);

      if (error) {
        logError("delete", error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      logError("delete", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Count active integrations for a database
   * Used to check if database can be deleted
   * 
   * @param database_cluster_id - The database cluster ID
   * @returns Result with count of active integrations
   */
  count_active_for_database: async (database_cluster_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { count, error } = await supabase
        .from("database_integrations")
        .select("*", { count: "exact", head: true })
        .eq("database_cluster_id", database_cluster_id)
        .eq("status", "linked");

      if (error) {
        logError("count_active_for_database", error);
        return { success: false, error: error.message, count: 0 };
      }

      return { success: true, count: count || 0 };
    } catch (err) {
      logError("count_active_for_database", err);
      return { success: false, error: String(err), count: 0 };
    }
  },

  /**
   * Count active integrations for an app
   * 
   * @param platform_app_id - The app UUID
   * @returns Result with count of active integrations
   */
  count_active_for_app: async (platform_app_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { count, error } = await supabase
        .from("database_integrations")
        .select("*", { count: "exact", head: true })
        .eq("platform_app_id", platform_app_id)
        .eq("status", "linked");

      if (error) {
        logError("count_active_for_app", error);
        return { success: false, error: error.message, count: 0 };
      }

      return { success: true, count: count || 0 };
    } catch (err) {
      logError("count_active_for_app", err);
      return { success: false, error: String(err), count: 0 };
    }
  },
};
