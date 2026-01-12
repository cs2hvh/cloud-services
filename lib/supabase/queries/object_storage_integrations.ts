/**
 * Object Storage Integrations Query Module
 * 
 * Handles all database operations for the object_storage_integrations table.
 * This module is ONLY responsible for data access - no business logic.
 * 
 * @module lib/supabase/queries/object_storage_integrations
 */

import { createServiceClient, createSSRClient } from "../server";
import type { 
  ObjectStorageIntegration, 
  ObjectStorageIntegrationInsert, 
  ObjectStorageIntegrationUpdate 
} from "../types";

/**
 * Helper function for consistent error logging
 */
function logError(method: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ObjectStorage_Integrations.${method}] Error:`, message);
}

export const ObjectStorage_Integrations = {
  /**
   * Create a new integration record
   */
  create: async (payload: ObjectStorageIntegrationInsert) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("object_storage_integrations")
        .insert(payload)
        .select()
        .single();

      if (error) {
        logError("create", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data as ObjectStorageIntegration };
    } catch (err) {
      logError("create", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Get integration by ID
   */
  get: async (id: string) => {
    try {
      const supabase = await createSSRClient();
      const { data, error } = await supabase
        .from("object_storage_integrations")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        logError("get", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data as ObjectStorageIntegration };
    } catch (err) {
      logError("get", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Get active integration for app + bucket combo
   * Returns the linked/pending record if exists
   */
  get_active: async (platform_app_id: string, object_space_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("object_storage_integrations")
        .select("*")
        .eq("platform_app_id", platform_app_id)
        .eq("object_space_id", object_space_id)
        .in("status", ["pending", "linked"])
        .maybeSingle();

      if (error) {
        logError("get_active", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data as ObjectStorageIntegration | null };
    } catch (err) {
      logError("get_active", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Get all integrations for an app
   */
  get_by_app: async (platform_app_id: string, include_unlinked = false) => {
    try {
      const supabase = await createSSRClient();
      let query = supabase
        .from("object_storage_integrations")
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

      return { success: true, data: (data || []) as ObjectStorageIntegration[] };
    } catch (err) {
      logError("get_by_app", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Get all integrations for a bucket
   */
  get_by_bucket: async (object_space_id: string, include_unlinked = false) => {
    try {
      const supabase = await createSSRClient();
      let query = supabase
        .from("object_storage_integrations")
        .select("*")
        .eq("object_space_id", object_space_id);

      if (!include_unlinked) {
        query = query.in("status", ["pending", "linked"]);
      }

      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        logError("get_by_bucket", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: (data || []) as ObjectStorageIntegration[] };
    } catch (err) {
      logError("get_by_bucket", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Update an integration record
   */
  update: async (id: string, payload: ObjectStorageIntegrationUpdate) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("object_storage_integrations")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        logError("update", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data as ObjectStorageIntegration };
    } catch (err) {
      logError("update", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Delete an integration record
   */
  delete: async (id: string) => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase
        .from("object_storage_integrations")
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
   * Mark integration as linked with injected keys
   */
  mark_linked: async (id: string, injected_env_keys: string[]) => {
    return ObjectStorage_Integrations.update(id, {
      status: "linked",
      injected_env_keys,
      error_message: null,
    });
  },

  /**
   * Mark integration as failed with error message
   */
  mark_failed: async (id: string, error_message: string) => {
    return ObjectStorage_Integrations.update(id, {
      status: "failed",
      error_message,
    });
  },

  /**
   * Mark integration as unlinked
   */
  mark_unlinked: async (id: string, unlinked_by: string) => {
    return ObjectStorage_Integrations.update(id, {
      status: "unlinked",
      unlinked_at: new Date().toISOString(),
      unlinked_by,
    });
  },

  /**
   * Get all integrations for a user
   */
  get_by_user: async (user_id: string, include_unlinked = false) => {
    try {
      const supabase = await createSSRClient();
      let query = supabase
        .from("object_storage_integrations")
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

      return { success: true, data: (data || []) as ObjectStorageIntegration[] };
    } catch (err) {
      logError("get_by_user", err);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Check if an app has any active storage integrations
   */
  has_active_integration: async (platform_app_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { count, error } = await supabase
        .from("object_storage_integrations")
        .select("*", { count: "exact", head: true })
        .eq("platform_app_id", platform_app_id)
        .in("status", ["pending", "linked"]);

      if (error) {
        logError("has_active_integration", error);
        return { success: false, error: error.message };
      }

      return { success: true, has_integration: (count || 0) > 0 };
    } catch (err) {
      logError("has_active_integration", err);
      return { success: false, error: String(err) };
    }
  },
};
