/**
 * Platform Apps Query Helpers
 * Handles CRUD operations for platform_apps and platform_app_webhooks tables
 */
import { createServiceClient } from "../server";

// ============================================
// Platform Apps Queries
// ============================================
export const Platform_Apps = {
  // Count apps owned by a user (for limit checks)
  count_by_owner: async (user_id: string): Promise<number> => {
    try {
      const supabase = await createServiceClient();
      const { count, error } = await supabase
        .from("platform_apps")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user_id);
      if (error) {
        console.error(`[Platform_Apps] Error counting apps: ${error.message}`);
        return 0;
      }
      return count || 0;
    } catch (err) {
      console.error(`[Platform_Apps] Error counting apps: ${err}`);
      return 0;
    }
  },

  // Check if app name already exists (globally unique for DNS/Jenkins)
  check_name_exists: async (name: string): Promise<boolean> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("platform_apps")
        .select("id")
        .eq("name", name)
        .maybeSingle();
      if (error) {
        console.error(`[Platform_Apps] Error checking name: ${error.message}`);
        return false; // Fail open - let create handle the error
      }
      return data !== null;
    } catch (err) {
      console.error(`[Platform_Apps] Error checking name: ${err}`);
      return false;
    }
  },

  create: async (payload: Record<string, unknown>) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("platform_apps")
        .insert(payload)
        .select()
        .single();
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  update: async (app_id: string, patch: Record<string, unknown>) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("platform_apps")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", app_id)
        .select()
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  get: async (app_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("platform_apps")
        .select("*")
        .eq("id", app_id)
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  list_by_owner: async (user_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("platform_apps")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", { ascending: false });
      if (error) {
        console.error(`[Platform_Apps] Error listing apps: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error(`[Platform_Apps] Error listing apps: ${err}`);
      return [];
    }
  },

  list_all: async () => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("platform_apps")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.error(`[Platform_Apps] Error listing all apps: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error(`[Platform_Apps] Error listing all apps: ${err}`);
      return [];
    }
  },

  delete: async (app_id: string, user_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase
        .from("platform_apps")
        .delete()
        .eq("id", app_id)
        .eq("user_id", user_id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  // Environment variables
  set_env_vars: async (app_id: string, env_vars: { key: string; value: string }[]) => {
    try {
      const supabase = await createServiceClient();
      
      // Delete existing env vars for this app
      await supabase
        .from("platform_app_env_vars")
        .delete()
        .eq("app_id", app_id);
      
      // Insert new env vars
      if (env_vars.length > 0) {
        const { error } = await supabase
          .from("platform_app_env_vars")
          .insert(env_vars.map(ev => ({ app_id, key: ev.key, value: ev.value })));
        
        if (error) return { success: false, error: error.message };
      }
      
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  get_env_vars: async (app_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("platform_app_env_vars")
        .select("*")
        .eq("app_id", app_id);
      if (error) {
        console.error(`[Platform_Apps] Error getting env vars: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error(`[Platform_Apps] Error getting env vars: ${err}`);
      return [];
    }
  },

  // Get app by repository ID and provider (for webhook lookups)
  get_by_repository: async (repository_id: string, git_provider: string) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("platform_apps")
        .select("*, platform_app_webhooks(*)")
        .eq("repository_id", repository_id)
        .eq("git_provider", git_provider)
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};

// ============================================
// Platform App Webhooks Queries
// ============================================
export const Platform_App_Webhooks = {
  create: async (payload: {
    app_id: string;
    provider: 'github' | 'gitlab' | 'bitbucket';
    webhook_id: string;
    webhook_secret: string;
    webhook_url: string;
    events?: string[];
  }) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("platform_app_webhooks")
        .insert({
          ...payload,
          events: payload.events || ['push'],
        })
        .select()
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  // Upsert: create or update webhook (ensures single webhook per app+provider)
  upsert: async (payload: {
    app_id: string;
    provider: 'github' | 'gitlab' | 'bitbucket';
    webhook_id: string;
    webhook_secret: string;
    webhook_url: string;
    events?: string[];
  }) => {
    try {
      const supabase = await createServiceClient();
      
      // First, delete any existing webhook for this app+provider
      await supabase
        .from("platform_app_webhooks")
        .delete()
        .eq("app_id", payload.app_id)
        .eq("provider", payload.provider);
      
      // Then insert the new one
      const { data, error } = await supabase
        .from("platform_app_webhooks")
        .insert({
          ...payload,
          events: payload.events || ['push'],
          auto_deploy_enabled: true,
        })
        .select()
        .single();
      
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  get_by_app: async (app_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("platform_app_webhooks")
        .select("*")
        .eq("app_id", app_id);
      if (error) return { success: false, error: error.message };
      return { success: true, data: data || [] };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  // Find app with webhook by repository (used by incoming webhooks)
  // Returns the FIRST app with auto_deploy_enabled that matches the branch
  // If multiple apps share same repo, each should have different deploy_branch
  find_by_repository: async (repository_id: string, provider: 'github' | 'gitlab' | 'bitbucket', branch?: string) => {
    try {
      const supabase = await createServiceClient();
      
      // Query WITHOUT .single() to handle multiple apps
      const query = supabase
        .from("platform_apps")
        .select(`
          *,
          platform_app_webhooks!inner(*)
        `)
        .eq("repository_id", repository_id)
        .eq("git_provider", provider)
        .eq("platform_app_webhooks.provider", provider)
        .eq("platform_app_webhooks.auto_deploy_enabled", true);
      
      const { data, error } = await query;
      
      if (error) {
        console.error(`[Platform_App_Webhooks] Error finding by repo: ${error.message}`);
        return null;
      }
      
      if (!data || data.length === 0) {
        console.log(`[Platform_App_Webhooks] No apps found for repository: ${repository_id}`);
        return null;
      }
      
      // If branch is provided, filter by deploy_branch
      let matchedApp = data[0];
      if (branch) {
        const branchMatch = data.find(app => {
          const deployBranch = app.deploy_branch || app.branch;
          return deployBranch === branch;
        });
        if (branchMatch) {
          matchedApp = branchMatch;
        } else {
          console.log(`[Platform_App_Webhooks] No app configured for branch: ${branch}`);
          // Still return the first app if no branch match (backward compatibility)
        }
      }
      
      if (data.length > 1) {
        console.log(`[Platform_App_Webhooks] Multiple apps (${data.length}) found for repo ${repository_id}, using: ${matchedApp.name}`);
      }
      
      // Flatten the response with all required fields for auto-deploy
      const webhook = matchedApp.platform_app_webhooks?.[0] || matchedApp.platform_app_webhooks;
      return {
        // App fields
        id: matchedApp.id,
        name: matchedApp.name,
        slug: matchedApp.slug,
        user_id: matchedApp.user_id,
        repository_url: matchedApp.repository_url,
        repository_name: matchedApp.repository_name,
        repository_id: matchedApp.repository_id,
        git_provider: matchedApp.git_provider,
        branch: matchedApp.branch,
        framework: matchedApp.framework,
        port: matchedApp.port || 3000,  // Default to 3000 if not set
        size: matchedApp.size || 'small',  // Default to small if not set
        status: matchedApp.status,
        deployment_url: matchedApp.deployment_url,
        // Webhook fields
        webhook_secret: webhook?.webhook_secret,
        webhook_id: webhook?.id,
        auto_deploy_enabled: webhook?.auto_deploy_enabled ?? true,
        deploy_branch: matchedApp.deploy_branch || matchedApp.branch,
      };
    } catch (err) {
      console.error(`[Platform_App_Webhooks] Error: ${err}`);
      return null;
    }
  },

  // Find ALL apps with webhooks by repository (for deploying multiple apps)
  find_all_by_repository: async (repository_id: string, provider: 'github' | 'gitlab' | 'bitbucket', branch?: string) => {
    try {
      const supabase = await createServiceClient();
      
      const { data, error } = await supabase
        .from("platform_apps")
        .select(`
          *,
          platform_app_webhooks!inner(*)
        `)
        .eq("repository_id", repository_id)
        .eq("git_provider", provider)
        .eq("platform_app_webhooks.provider", provider)
        .eq("platform_app_webhooks.auto_deploy_enabled", true);
      
      if (error) {
        console.error(`[Platform_App_Webhooks] Error finding apps by repo: ${error.message}`);
        return [];
      }
      
      if (!data || data.length === 0) {
        return [];
      }
      
      // Filter by branch if provided
      let filteredApps = data;
      if (branch) {
        filteredApps = data.filter(app => {
          const deployBranch = app.deploy_branch || app.branch;
          return deployBranch === branch;
        });
      }
      
      // Map to flattened format
      return filteredApps.map(app => {
        const webhook = app.platform_app_webhooks?.[0] || app.platform_app_webhooks;
        return {
          id: app.id,
          name: app.name,
          slug: app.slug,
          user_id: app.user_id,
          repository_url: app.repository_url,
          repository_name: app.repository_name,
          repository_id: app.repository_id,
          git_provider: app.git_provider,
          branch: app.branch,
          framework: app.framework,
          port: app.port || 3000,
          size: app.size || 'small',
          status: app.status,
          deployment_url: app.deployment_url,
          webhook_secret: webhook?.webhook_secret,
          webhook_id: webhook?.id,
          auto_deploy_enabled: webhook?.auto_deploy_enabled ?? true,
          deploy_branch: app.deploy_branch || app.branch,
        };
      });
    } catch (err) {
      console.error(`[Platform_App_Webhooks] Error: ${err}`);
      return [];
    }
  },

  update: async (webhook_id: string, patch: Record<string, unknown>) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("platform_app_webhooks")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", webhook_id)
        .select()
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  // Record webhook trigger
  record_trigger: async (webhook_id: string, error?: string) => {
    try {
      const supabase = await createServiceClient();
      
      // First get current count
      const { data: current } = await supabase
        .from("platform_app_webhooks")
        .select("trigger_count")
        .eq("id", webhook_id)
        .single();
      
      const newCount = (current?.trigger_count || 0) + 1;
      
      const { error: updateError } = await supabase
        .from("platform_app_webhooks")
        .update({
          last_triggered_at: new Date().toISOString(),
          trigger_count: newCount,
          last_error: error || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", webhook_id);
      
      return !updateError;
    } catch {
      return false;
    }
  },

  delete: async (app_id: string, provider: 'github' | 'gitlab' | 'bitbucket') => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase
        .from("platform_app_webhooks")
        .delete()
        .eq("app_id", app_id)
        .eq("provider", provider);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  delete_all_for_app: async (app_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase
        .from("platform_app_webhooks")
        .delete()
        .eq("app_id", app_id);
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
};
