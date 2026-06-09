import { createWorkerClient, createServiceClient, createClient, createSSRClient } from "../server";
import { Tables, TablesInsert, TablesUpdate, Admin_SpectrumApp } from "../types";

type SpectrumAppRow = Tables<"spectrum_apps">;

export const Spectrum_Apps = {
  create: async (payload: TablesInsert<"spectrum_apps">) => {
    try {
      const supabase = await createWorkerClient();
      const { data, error } = await supabase
        .from("spectrum_apps")
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
  update: async (spectrum_id: string, patch: TablesUpdate<"spectrum_apps">) => {
    try {
      //console.log("reached update spectrum app", spectrum_id, patch);
      const supabase = await createWorkerClient();
      const { data, error } = await supabase
        .from("spectrum_apps")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("spectrum_id", spectrum_id)
        .select()
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  get: async (spectrum_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("spectrum_apps")
        .select("*")
        .eq("spectrum_id", spectrum_id)
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  list_by_owner: async (owner_id: string): Promise<SpectrumAppRow[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("spectrum_apps")
        .select("*")
        .eq("owner_id", owner_id)
        .neq("status", "deleted")
        .order("created_at", { ascending: false });
      if (error) return [];
      return data || [];
    } catch {
      return [];
    }
  },
  delete: async (spectrum_id: string) => {
    try {
      const supabase = await createWorkerClient();
      const { data, error } = await supabase
        .from("spectrum_apps")
        .delete()
        .eq("id", spectrum_id)
        .select();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  mark_as_deleted: async (spectrum_id: string) => {
    console.log("reached mark as delete");
    try {
      const supabase = await createWorkerClient();
      const { data, error } = await supabase
        .from("spectrum_apps")
        .update({ status: "deleted" })
        .eq("spectrum_id", spectrum_id)
        .select();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err) {
      console.log("error in mark as delete", err);
      return { success: false, error: String(err) };
    }
  },

  // Admin methods
  get_all_for_admin: async (): Promise<Admin_SpectrumApp[]> => {
    try {
      const supabase = await createServiceClient();

      // Get all spectrum apps
      const { data: apps, error } = await supabase
        .from("spectrum_apps")
        .select(
          `
          id,
          spectrum_id,
          protocol,
          origin_direct,
          status,
          tls,
          traffic_type,
          ip_firewall,
          proxy_protocol,
          edge_ips,
          created_at,
          project_id,
          owner_id,
          dns,
          user_profiles(username)
        `
        )
        .neq("status", "deleted")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(
          `[Spectrum_Apps] Error getting all apps for admin: ${error.message}`
        );
        return [];
      }

      if (!apps || apps.length === 0) return [];

      // Get unique owner IDs to minimize auth queries
      const uniqueOwnerIds = [
        ...new Set(apps.map((a) => a.owner_id).filter(Boolean)),
      ];

      // Batch fetch only the needed user emails
      const emailMap = new Map<string, string>();
      if (uniqueOwnerIds.length > 0) {
        const { data: authUsers, error: authError } =
          await supabase.auth.admin.listUsers();

        if (!authError && authUsers?.users) {
          authUsers.users
            .filter((u) => uniqueOwnerIds.includes(u.id))
            .forEach((u) => {
              if (u.id && u.email) emailMap.set(u.id, u.email);
            });
        }
      }

      // Map and merge data with proper typing
      const merged: Admin_SpectrumApp[] = apps
        .map((app) => {
          // Safely access nested user_profiles
          const userProfile = Array.isArray(app.user_profiles)
            ? app.user_profiles[0]
            : app.user_profiles;

          return {
            id: app.id ?? "",
            spectrum_id: app.spectrum_id ?? "",
            protocol: app.protocol ?? "",
            origin_direct: app.origin_direct ?? [],
            status: app.status ?? null,
            tls: app.tls ?? "off",
            traffic_type: app.traffic_type ?? "direct",
            ip_firewall: app.ip_firewall ?? false,
            proxy_protocol: app.proxy_protocol ?? "off",
            owner_id: app.owner_id ?? "",
            owner_email: emailMap.get(app.owner_id ?? "") ?? null,
            owner_username: userProfile?.username ?? null,
            created_at: app.created_at ?? null,
            project_id: app.project_id ?? null,
            edge_ips: app.edge_ips ?? null,
            dns: app.dns ?? null,
          };
        })
        .filter((app) => app.id !== ""); // Filter out invalid entries

      return merged;
    } catch (err) {
      console.error(`[Spectrum_Apps] Error in get_all_for_admin: ${err}`);
      return [];
    }
  },

  // Existing (hostname, protocol) pairs for the create-form duplicate check.
  // Cloudflare Spectrum keys an application on hostname + protocol/port, so the
  // same domain may be reused across different protocols/ports — a clash only
  // occurs when BOTH the hostname and the protocol match. We therefore return
  // the protocol alongside the name rather than names alone.
  get_all_app_name: async (
    role: string
  ): Promise<{ name: string; protocol: string }[]> => {
    try {
      const supabase = await (role === "admin"
        ? createSSRClient()
        : createWorkerClient());
      const { data, error } = await supabase
        .from("spectrum_apps")
        .select("dns->>original_name, protocol")
        .neq("status", "deleted")
        .order("created_at", { ascending: false });

      if (error) return [];

      return (data || [])
        .map((row) => ({
          name: (row as { original_name?: string | null }).original_name ?? "",
          protocol: (row as { protocol?: string | null }).protocol ?? "",
        }))
        .filter((r) => r.name);
    } catch {
      return [];
    }
  },

  get_by_project_id: async (projectId: string): Promise<SpectrumAppRow[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("spectrum_apps")
        .select("*")
        .eq("project_id", projectId)
        .neq("status", "deleted")
        .order("created_at", { ascending: false });
      if (error) {
        console.error(
          `[Spectrum_Apps.get_by_project_id] Error: ${error.message}`
        );
        return [];
      }
      return data || [];
    } catch (err) {
      console.error(`[Spectrum_Apps.get_by_project_id] Error: ${err}`);
      return [];
    }
  },
};
