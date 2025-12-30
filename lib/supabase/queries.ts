// import { Encryption } from "@/config/functions";
// import Error from "next/error";
import { createClient, createSSRClient, createWorkerClient } from "./server";
import { createServiceClient } from "./server";
import {
  network_rules,
  Tables,
  TablesInsert,
  TablesUpdate,
  EncryptedData,
  Database_Connection,
  DatabaseUser,
  DatabaseInstance,
  Admin_User,
  Admin_Database,
  Admin_Bucket,
  Admin_SpectrumApp,
  ObjectSpaceBucket,
  Admin_KubernetesCluster,
} from "./types";
// import { createClient as clientWorker } from "@supabase/supabase-js";

type UserProfile = Tables<"user_profiles">;
type Project = Tables<"projects">;
type ProjectLog = Tables<"project_logs">;
type GameServer = Tables<"game_servers">;
type Product = Tables<"products">;
type Location = Tables<"locations">;
type OTP = Tables<"otps">;
type  Clusters = Tables<"clusters">;
type  ClustersGet = Tables<"clusters_get">;
type Database = Tables<"database_clusters">;
type Activity = Tables<"activities">;


export const Users = {
  // Get a user by ID
  get_by_id: async (userId: string): Promise<UserProfile | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        console.log(
          `[Supabase] Error while getting user by id: ${error.message}`,
        );
        return null;
      }
      return data;
    } catch (err) {
      console.log(`[Supabase] Error while getting user by id: ${err}`);
      return null;
    }
  },

  get_by_email: async (
    email: string,
  ): Promise<(UserProfile & { email: string }) | null> => {
    try {
      const supabase = await createServiceClient();
      const { data: authUser, error: authError } =
        await supabase.auth.admin.listUsers();

      if (authError) {
        // console.log(
        //   `[Supabase] Error while getting user by email: ${authError.message}`,
        // );
        return null;
      }

      const user = authUser.users.find((u) => u.email === email);
      if (!user) return null;

      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.log(
          `[Supabase] Error while getting user profile: ${profileError.message}`,
        );
        return null;
      }

      return { ...profile, email: user.email || "" };
    } catch (err) {
      console.log(`[Supabase] Error while getting user by email: ${err}`);
      return null;
    }
  },

  // Get all users
  get_all: async (): Promise<UserProfile[]> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.log(
          `[Supabase] Error while getting all users: ${error.message}`,
        );
        return [];
      }
      return data || [];
    } catch (err) {
      console.log(`[Supabase] Error while getting all users: ${err}`);
      return [];
    }
  },
  get_all_profiles: async (): Promise<Admin_User[]> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("user_profiles")
        .select(`
          id,
          username, 
          display_name, 
          avatar,
          steam, 
          discord,
          background,
          bio,
          roles,
          created_at,
          updated_at,
          suspend,
          two_factor_enabled,
          db_counts:database_cluster!owner_id(count),
          kc_counts:clusters!owner_id(count),
          server_counts:game_servers!user_id(count)
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.log(
          `[Supabase] Error while getting all users: ${error.message}`,
        );
        return [];
      }

      if (!data) return [];
      
      const { data: authUsers } = await supabase.auth.admin.listUsers();

      // Merge user profiles with auth data to include emails and extract counts
      const merged: Admin_User[] = data.map((u) => ({
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        avatar: u.avatar,
        steam: u.steam,
        discord: u.discord,
        background: u.background,
        bio: u.bio,
        roles: u.roles,
        created_at: u.created_at,
        updated_at: u.updated_at,
        suspend: u.suspend,
        two_factor_enabled: u.two_factor_enabled,
        email: authUsers?.users.find(a => a.id === u.id)?.email || null,
        db_counts: u.db_counts?.[0]?.count || 0,
        kc_counts: u.kc_counts?.[0]?.count || 0,
        server_counts: u.server_counts?.[0]?.count || 0,
      }));

      return merged;
    } catch (err) {
      console.log(`[Supabase] Error while getting all users: ${err}`);
      return [];
    }
  },

  get_by_discord: async (discordId: string): Promise<UserProfile | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("discord", discordId)
        .single();

      if (error) {
        console.log(
          `[Supabase] Error while getting user by discord: ${error.message}`,
        );
        return null;
      }
      return data;
    } catch (err) {
      console.log(`[Supabase] Error while getting user by discord: ${err}`);
      return null;
    }
  },

  get_by_steam: async (steamId: string): Promise<UserProfile | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("steam", steamId)
        .single();

      if (error) {
        console.log(
          `[Supabase] Error while getting user by steam: ${error.message}`,
        );
        return null;
      }
      return data;
    } catch (err) {
      console.log(`[Supabase] Error while getting user by steam: ${err}`);
      return null;
    }
  },

  update_password: async (userId: string, newPassword: string): Promise<boolean> => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase.auth.admin.updateUserById(
        userId,
        { password: newPassword }
      );

      if (error) {
        console.log(`[Supabase] Error while updating user password: ${error.message}`);
        return false;
      }
      return true;
    } catch (err) {
      console.log(`[Supabase] Error while updating user password: ${err}`);
      return false;
    }
  },

  // Create a new user profile (called automatically by trigger)
  create: async (
    props: TablesInsert<"user_profiles">,
  ): Promise<string | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("user_profiles")
        .insert(props)
        .select("id")
        .single();

      if (error) {
        console.log(
          `[Supabase] Error while creating user profile: ${error.message}`,
        );
        return null;
      }
      return data.id;
    } catch (err) {
      console.log(`[Supabase] Error while creating user profile: ${err}`);
      return null;
    }
  },

  // Update an existing user
  update: async (
    id: string,
    props: TablesUpdate<"user_profiles">,
  ): Promise<boolean> => {
    try {
      const supabase = await createClient();
      const { error } = await supabase
        .from("user_profiles")
        .update(props)
        .eq("id", id);

      if (error) {
        console.log(`[Supabase] Error while updating user: ${error.message}`);
        return false;
      }
      return true;
    } catch (err) {
      console.log(`[Supabase] Error while updating user: ${err}`);
      return false;
    }
  },

  // Delete a user by ID
  delete: async (userId: string): Promise<boolean> => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase.auth.admin.deleteUser(userId);

      if (error) {
        console.log(`[Supabase] Error while deleting user: ${error.message}`);
        return false;
      }
      return true;
    } catch (err) {
      console.log(`[Supabase] Error while deleting user: ${err}`);
      return false;
    }
  },

  // Count all users
  count_all: async (): Promise<number> => {
    try {
      const supabase = await createClient();
      const { count, error } = await supabase
        .from("user_profiles")
        .select("*", { count: "exact", head: true });

      if (error) {
        console.log(`[Supabase] Error while counting users: ${error.message}`);
        return 0;
      }
      return count || 0;
    } catch (err) {
      console.log(`[Supabase] Error while counting users: ${err}`);
      return 0;
    }
  },
};

export const Projects = {
  // Get a project by ID
  get_by_id: async (id: string): Promise<Project | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.log(
          `[Supabase] Error while getting project by id: ${error.message}`,
        );
        return null;
      }
      return data;
    } catch (err) {
      console.log(`[Supabase] Error while getting project by id: ${err}`);
      return null;
    }
  },

  // Get all projects where user is involved
  get_all_by_user: async (userId: string): Promise<Project[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("owner", userId)

      if (error) {
        console.log(
          `[Supabase] Error............. while getting projects by userId: ${error.message}`,
        );
        return [];
      }
      return data || [];
    } catch (err) {
      console.log(`[Supabase] Error while getting projects by userId: ${err}`);
      return [];
    }
  },
  // Get all projects where user is involved
  get_all_for_admin: async (): Promise<Project[]> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("projects")
        .select("*")

      if (error) {
        console.log(
          `[Supabase] Error............. while getting projects by userId: ${error.message}`,
        );
        return [];
      }
      return data || [];
    } catch (err) {
      console.log(`[Supabase] Error while getting projects by userId: ${err}`);
      return [];
    }
  },

  create: async (props: TablesInsert<"projects">): Promise<string | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("projects")
        .insert(props)
        .select("id")
        .single();

      if (error) {
        console.log(
          `[Supabase] Error while creating project: ${error.message}`,
        );
        return null;
      }
      return data.id;
    } catch (err) {
      console.log(`[Supabase] Error while creating project: ${err}`);
      return null;
    }
  },

  // Update an existing project
  update: async (
    id: string,
    props: TablesUpdate<"projects">,
  ): Promise<boolean> => {
    try {
      const supabase = await createClient();
      const { error } = await supabase
        .from("projects")
        .update(props)
        .eq("id", id);

      if (error) {
        console.log(
          `[Supabase] Error while updating project: ${error.message}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      console.log(`[Supabase] Error while updating project: ${err}`);
      return false;
    }
  },

  // Delete a project
  delete: async (id: string): Promise<boolean> => {
    try {
      const supabase = await createClient();
      const { error } = await supabase.from("projects").delete().eq("id", id);

      if (error) {
        console.log(
          `[Supabase] Error while deleting project: ${error.message}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      console.log(`[Supabase] Error while deleting project: ${err}`);
      return false;
    }
  },

  get_logs: async (projectId: string): Promise<ProjectLog[] | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("project_logs")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) {
        console.log(
          `[Supabase] Error while getting project logs: ${error.message}`,
        );
        return null;
      }
      return data;
    } catch (err) {
      console.log(`[Supabase] Error while getting project logs: ${err}`);
      return null;
    }
  },

  get_logs_by_user: async (userId: string): Promise<ProjectLog[] | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("project_logs")
        .select("* ,projects!inner(*)")
        .eq("projects.owner", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.log(
          `[Supabase] Error while getting project logs: ${error.message}`,
        );
        return [];
      }
      return data;
    } catch (err) {
      console.log(`[Supabase] Error while getting project logs: ${err}`);
      return [];
    }
  },

  add_log: async (props: TablesInsert<"project_logs">,role?:string): Promise<boolean> => {
    try {
      const supabase =role==='admin' ? await createServiceClient() : await createClient();
      const { error } = await supabase.from("project_logs").insert(props);

      if (error) {
        console.log(
          `[Supabase] Error while creating project log: ${error.message}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      console.log(`[Supabase] Error while creating project log: ${err}`);
      return false;
    }
  },

  // Count all projects
  count_all: async (): Promise<number> => {
    try {
      const supabase = await createClient();
      const { count, error } = await supabase
        .from("projects")
        .select("*", { count: "exact", head: true });

      if (error) {
        console.log(
          `[Supabase] Error while counting projects: ${error.message}`,
        );
        return 0;
      }
      return count || 0;
    } catch (err) {
      console.log(`[Supabase] Error while counting projects: ${err}`);
      return 0;
    }
  },
};

export const GameServers = {
  get_by_id: async (id: number): Promise<GameServer | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("game_servers")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.log(
          `[Supabase] Error while getting game server by id: ${error.message}`,
        );
        return null;
      }
      return data;
    } catch (err) {
      console.log(`[Supabase] Error while getting game server by id: ${err}`);
      return null;
    }
  },

  get_by_user: async (userId: string): Promise<GameServer[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("game_servers")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.log(
          `[Supabase] Error while getting game servers by user: ${error.message}`,
        );
        return [];
      }
      return data || [];
    } catch (err) {
      console.log(
        `[Supabase] Error while getting game servers by user: ${err}`,
      );
      return [];
    }
  },

  get_by_project: async (projectId: string): Promise<GameServer[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("game_servers")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) {
        console.log(
          `[Supabase] Error while getting game servers by project: ${error.message}`,
        );
        return [];
      }
      return data || [];
    } catch (err) {
      console.log(
        `[Supabase] Error while getting game servers by project: ${err}`,
      );
      return [];
    }
  },

  create: async (
    props: TablesInsert<"game_servers">,
  ): Promise<number | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("game_servers")
        .insert(props)
        .select("id")
        .single();

      if (error) {
        console.log(
          `[Supabase] Error while creating game server: ${error.message}`,
        );
        return null;
      }
      return data.id;
    } catch (err) {
      console.log(`[Supabase] Error while creating game server: ${err}`);
      return null;
    }
  },

  update: async (
    id: number,
    props: TablesUpdate<"game_servers">,
  ): Promise<boolean> => {
    try {
      const supabase = await createClient();
      const { error } = await supabase
        .from("game_servers")
        .update(props)
        .eq("id", id);

      if (error) {
        console.log(
          `[Supabase] Error while updating game server: ${error.message}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      console.log(`[Supabase] Error while updating game server: ${err}`);
      return false;
    }
  },

  delete: async (id: number): Promise<boolean> => {
    try {
      const supabase = await createClient();
      const { error } = await supabase
        .from("game_servers")
        .delete()
        .eq("id", id);

      if (error) {
        console.log(
          `[Supabase] Error while deleting game server: ${error.message}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      console.log(`[Supabase] Error while deleting game server: ${err}`);
      return false;
    }
  },
};

export const Products = {
  get_by_id: async (id: string): Promise<Product | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.log(
          `[Supabase] Error while getting product by id: ${error.message}`,
        );
        return null;
      }
      return data;
    } catch (err) {
      console.log(`[Supabase] Error while getting product by id: ${err}`);
      return null;
    }
  },

  get_all: async (): Promise<Product[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.log(
          `[Supabase] Error while getting all products: ${error.message}`,
        );
        return [];
      }
      return data || [];
    } catch (err) {
      console.log(`[Supabase] Error while getting all products: ${err}`);
      return [];
    }
  },

  get_by_type: async (type: string): Promise<Product[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("type", type)
        .order("created_at", { ascending: false });

      if (error) {
        console.log(
          `[Supabase] Error while getting products by type: ${error.message}`,
        );
        return [];
      }
      return data || [];
    } catch (err) {
      console.log(`[Supabase] Error while getting products by type: ${err}`);
      return [];
    }
  },

  get_by_type_and_subtype: async (type: string, subtype: string): Promise<Product[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("type", type)
        .eq("sub", subtype)
        .order("created_at", { ascending: false });

      if (error) {
        console.log(
          `[Supabase] Error while getting products by type and subtype: ${error.message}`,
        );
        return [];
      }
      return data || [];
    } catch (err) {
      console.log(`[Supabase] Error while getting products by type and subtype: ${err}`);
      return [];
    }
  },

  create: async (
    props: TablesInsert<"products">,
  ): Promise<{ success: boolean; data?: Product; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("products")
        .insert(props)
        .select("*")
        .single();

      if (error) {
        console.log(
          `[Supabase] Error while creating product: ${error.message}`,
        );
        return { success: false, error: error.message };
      }
      return { success: true, data };
    } catch (err) {
      console.log(`[Supabase] Error while creating product: ${err}`);
      return { success: false, error: String(err) };
    }
  },

  update: async (
    id: string,
    props: TablesUpdate<"products">,
  ): Promise<{ success: boolean; data?: Product; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("products")
        .update(props)
        .eq("id", id)
        .select("*")
        .single();

      if (error) {
        console.log(`[Supabase] Error while updating product: ${error.message}`);
        return { success: false, error: error.message };
      }
      return { success: true, data };
    } catch (err) {
      console.log(`[Supabase] Error while updating product: ${err}`);
      return { success: false, error: String(err) };
    }
  },

  delete: async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase.from("products").delete().eq("id", id);

      if (error) {
        console.log(`[Supabase] Error while deleting product: ${error.message}`);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err) {
      console.log(`[Supabase] Error while deleting product: ${err}`);
      return { success: false, error: String(err) };
    }
  },

  check_usage: async (
    id: string,
  ): Promise<{ inUse: boolean; count: number }> => {
    try {
      const supabase = await createServiceClient();
      
      // Check if any database cluster is using this product's size
      // The size field in database_clusters matches the product id pattern
      const { count, error } = await supabase
        .from("database_clusters")
        .select("*", { count: "exact", head: true })
        .eq("size", id);

      if (error) {
        console.log(
          `[Supabase] Error while checking product usage: ${error.message}`,
        );
        return { inUse: false, count: 0 };
      }

      return { inUse: (count || 0) > 0, count: count || 0 };
    } catch (err) {
      console.log(`[Supabase] Error while checking product usage: ${err}`);
      return { inUse: false, count: 0 };
    }
  },
};

export const Locations = {
  get_all: async (): Promise<Location[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .eq("available", true)
        .eq("cluster_type", "database")
        .order("city");

      if (error) {
        console.log(
          `[Supabase] Error while getting locations: ${error.message}`
        );
        return [];
      }
      return data || [];
    } catch (err) {
      console.log(`[Supabase] Error while getting locations: ${err}`);
      return [];
    }
  },
  get_by_type: async (type: string): Promise<Location[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .eq("available", true)
        .eq("cluster_type", type)
        .order("city");

      if (error) {
        console.log(
          `[Supabase] Error while getting locations: ${error.message}`
        );
        return [];
      }
      return data || [];
    } catch (err) {
      console.log(`[Supabase] Error while getting locations: ${err}`);
      return [];
    }
  },
  create: async (payload: Location) => {
    const supabase = await createSSRClient();
    const { data, error } = await supabase
      .from("locations")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.error("[Locations] insert failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data };
  },
};

        

export const OTPs = {
  create: async (props: TablesInsert<"otps">): Promise<number | null> => {
    try {
      const supabase = await createSSRClient();
      const { data, error } = await supabase
        .from("otps")
        .insert(props)
        .select("id")
        .single();

      if (error) {
        console.log(`[Supabase] Error while creating OTP: ${error.message}`);
        return null;
      }
      return data.id;
    } catch (err) {
      console.log(`[Supabase] Error while creating OTP: ${err}`);
      return null;
    }
  },

  get_by_email: async (email: string): Promise<OTP | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("otps")
        .select("*")
        .eq("email", email)
        .eq("verified", false)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.log(`[Supabase] Error while getting OTP: ${error.message}`);
        return null;
      }
      return data;
    } catch (err) {
      console.log(`[Supabase] Error while getting OTP: ${err}`);
      return null;
    }
  },

  verify: async (id: number): Promise<boolean> => {
    try {
      const supabase = await createClient();
      const { error } = await supabase
        .from("otps")
        .update({ verified: true })
        .eq("id", id);

      if (error) {
        console.log(`[Supabase] Error while verifying OTP: ${error.message}`);
        return false;
      }
      return true;
    } catch (err) {
      console.log(`[Supabase] Error while verifying OTP: ${err}`);
      return false;
    }
  },

  verify_otp: async (email: string, otp_code: string): Promise<{ id: number; verified: boolean; expires_at: string } | null> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("otps")
        .select("id, verified, expires_at")
        .eq("email", email)
        .eq("otp_code", otp_code)
        .eq("verified", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        console.log(`[Supabase] Error while verifying OTP: ${error?.message || 'No data found'}`);
        return null;
      }
      return data;
    } catch (err) {
      console.log(`[Supabase] Error while verifying OTP: ${err}`);
      return null;
    }
  },
};


// export const Vms = {
//   // Get a project by ID
//   get_by_specs: async (payloads: {
//     name: string;
//     location: string;
//     version: string;
//     planDetails: Plan;
//     nodes: number;
//   }) => {
//    // console.log(payloads, "...........in buildPayloadWithFreeIps........");
//     const nodeKeys = makeNodeKeys(payloads.nodes);
//     console.log(nodeKeys, "...........nodeKeys........");

//     const supabase = await createSSRClient()

//     const { data, error } = await supabase
//       .from("vms")
//       .select(
//         "id, ip_address, username, location,ram,cpu,storage, status, created_at"
//       )
//       .eq("location", payloads.location)
//       .eq("status", "free")
//       .eq("ram", payloads.planDetails.ram)
//       .eq("cpu", payloads.planDetails.cpu)
//       .eq("storage", payloads.planDetails.storage)
//       .order("created_at", { ascending: true })
//       .limit(payloads.nodes + 1);

//     //console.log(res.status, "...........res.status........");

//     if (error) {
//       // const msg = await res.text().catch(() => "Failed to fetch free IPs");
//       console.log(error.message, "...............error.message");
//       return { success: false, error: error.message };
//     }
//     console.log(data, "...............data");

//     const ips = data.slice(0, payloads.nodes + 1).map((v) => v.ip_address);

//     //3) Build node map with attached IPs
//     const nodes: Record<
//       string,
//       {
//         host: string;
//         role: "control-plane" | "worker";
//         hostname: string;
//         cpu: number;
//         memory_mb: number;
//       }
//     > = {};

//     nodeKeys.forEach((key, i) => {
//       nodes[key] = {
//         host: ips[i],
//         role: key.startsWith("cp-") ? "control-plane" : "worker",
//         hostname: key,
//         cpu: payloads.planDetails.cpu,
//         memory_mb: payloads.planDetails.ram,
//       };
//     });

//     // 4) Final payload (IPs included; no passwords in ips array)
//     const payload = {
//       provider: "existing",
//       cluster: {
//         name: payloads.name,
//         location: payloads.location,
//         pod_cidr: "10.244.0.0/16",
//         k8s_minor: payloads.version,
//       },
//       auth: { method: "password", user: "root", password: "luV5DivOV98g" }, // <-- replace with your real secret handling
//       nodes,
//       ips, // only IPs, as requested
//     };

//     return { success: true, payload };
//   },

//   update_vm_by_ip: async (ips: string[]) => {
//     console.log(ips, "...............ips");


//     const { data, error } = await supabase
//       .from("vms")
//       .update({ status: "used" })
//       .in("ip_address", ips) // <- match multiple rows by IP
//       .eq("status", "free") // optional guard: only free -> used
//       .select("id, ip_address, username, location, status, created_at");
//     if (error?.message) {
//       console.log(error?.message, "...............error.message");
//       throw new Error(error.message);
//     }

//     return {
//       success: true,
//       message: "IP status updated successfully",
//       data: data,
//     };
//   },
// };


export const Clusters = {
  // Get a project by ID
//   create:async(payload:Clusters )=>{

//     const encryptedKubeconfig = payload.kubeConfig
//         ? Encryption.encrypt(payload.kubeConfig, process.env.ENCRYPTION_KEY!)
//         : null;
//       const row = {
//     cluster_id: payload.clusterId,
//     cluster_name: payload.clusterName,

//     control_plane: payload.controlPlane ?? null,
//     workers: payload.workers ?? [],

//     create_status: payload.createStatus ?? false,
//     connect_status: payload.connectStatus ?? false,
//     verify_status: payload.verifyStatus ?? false,

//     kubeconfig: encryptedKubeconfig ?? null,
//     node_config: payload.nodeConfig ?? null,

//     cni_plugin: payload.cniPlugin ?? null,
//     k8s_version: payload.k8sVersion ?? null,

//     status: payload.status ?? "pending",
//     password: payload.password ?? null,
//    // owner_id: payload.ownerId ?? null,
//   };


  

//   const { data, error } = await supabase
//     .from("clusters")
//     .insert(row)
//     .select()
//     .single();

//   if (error) {
//     console.error("[createClusterWorker] insert failed:", error.message);
//     return { success: false, error: error.message };
//   }
//   return { 
//     success: true, 
//     cluster: data 
//   };
//   },

//   update: async (params: {
//   clusterId: string;
//   phase: Phase;
//   value?: boolean;
//   status?: Status;
//   extras?: Partial<{
//     control_plane: string | null;
//     workers: string[];
//     kubeconfig: string | null;
//     node_config: NodeConfig | null;
//     cni_plugin: string | null;
//     k8s_version: string | null;
//   }>;
// }) => {
//   const { clusterId, phase, value = true, status, extras = {} } = params;

//   const fieldMap: Record<
//     Phase,
//     "create_status" | "connect_status" | "verify_status"
//   > = {
//     create: "create_status",
//     connect: "connect_status",
//     verify: "verify_status",
//   };

//   const patch:Patch  = {
//     [fieldMap[phase]]: value,
//     ...extras,
//   };
//    if (status) patch.status = status;


//   const supabase = clientWorker(
//   process.env.SUPABASE_URL!, // or SUPABASE_URL
//   process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!, // service role for server-side writes
//   { auth: { persistSession: false } }
// );

//   const { data, error } = await supabase
//     .from("clusters")
//     .update(patch)
//     .eq("cluster_id", clusterId)
//     .select()
//     .single();

//   if (error) {
//     console.error("[updateClusterPhaseWorker] failed:", error.message);
//     return { success: false, error: error.message };
//   }
//   return { success: true, cluster: data };
//   },
  
   get_by_project_id: async (projectId: string): Promise<ClustersGet[]>=> {
    try {
      //console.log(projectId,"..................933..id");


       if (!projectId || typeof projectId !== 'string') {
      console.error('[Clusters.get_by_project_id] Invalid project ID');
      return [];
    }


     const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      console.error('[Clusters.get_by_project_id] Invalid UUID format');
      return [];
    }

   const supabase = await createWorkerClient();
      const { data, error } = await supabase
        .from("clusters")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) {
        console.log(
          `[Supabase] Error while getting project by id: ${error.message}`,
        );
        return [];
      }
      return data;
    } catch (err) {
      console.log(`[Supabase] Error while getting project by id: ${err}`);
      return [];
    }
  },



   get_by_user_id: async (userId: string): Promise<ClustersGet[]>=> {
    try {
      //console.log(projectId,"..................933..id");


       if (!userId || typeof userId !== 'string') {
      console.error('[Clusters.get_by_user_id] Invalid user ID');
      return [];
    }


     const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      console.error('[Clusters.get_by_user_id] Invalid UUID format');
      return [];
    }

   const supabase = await createWorkerClient();
      const { data, error } = await supabase
        .from("clusters")
        .select("*")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.log(
          `[Supabase] Error while getting project by id: ${error.message}`,
        );
        return [];
      }
      return data;
    } catch (err) {
      console.log(`[Supabase] Error while getting project by id: ${err}`);
      return [];
    }
  },

   get_by_id: async (cluster_id: string): Promise<ClustersGet | null> => {
    try {
      //console.log(cluster_id,"..................933..id");
       const supabase = await createWorkerClient();
      const { data, error } = await supabase
        .from("clusters")
        .select("*")
        .eq("cluster_id", cluster_id)
        .single();

      if (error) {
        console.log(
          `[Supabase] Error while getting project by id: ${error.message}`,
        );
        return null;
      }
      return data;
    } catch (err) {
      console.log(`[Supabase] Error while getting project by id: ${err}`);
      return null;
    }
  },

  get_all_for_admin: async (): Promise<Admin_KubernetesCluster[]> => {
    try {
      const supabase = await createServiceClient();
      
      // Get all clusters
      const { data: clusters, error } = await supabase
        .from("clusters")
        .select(`
          id,
          cluster_id,
          cluster_name,
          project_id,
          owner_id,
          status,
          k8s_version,
          cni_plugin,
          node_config,
          control_plane,
          workers,
          created_at,
          user_profiles(username)
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.error(
          `[Clusters] Error getting all for admin: ${error.message}`
        );
        return [];
      }

      if (!clusters || clusters.length === 0) return [];

      // Get auth users for emails
      const { data: authUsers, error: authError } =
        await supabase.auth.admin.listUsers();

      if (authError) {
        console.log(
          `[Clusters] Error getting auth users: ${authError.message}`
        );
      }

      const emailMap = new Map(
        authUsers?.users?.map((u) => [u.id, u.email]) || []
      );

      // Map and merge data with proper typing
      const merged: Admin_KubernetesCluster[] = clusters
        .map((cluster) => {
          // Safely access nested user_profiles
          const userProfile = Array.isArray(cluster.user_profiles)
            ? cluster.user_profiles[0]
            : cluster.user_profiles;

          return {
            id: cluster.id ?? "",
            cluster_id: cluster.cluster_id ?? "",
            cluster_name: cluster.cluster_name ?? "",
            project_id: cluster.project_id ?? "",
            owner_id: cluster.owner_id ?? "",
            owner_email: emailMap.get(cluster.owner_id ?? "") ?? null,
            owner_username: userProfile?.username ?? null,
            status: cluster.status ?? "pending",
            k8s_version: cluster.k8s_version ?? null,
            cni_plugin: cluster.cni_plugin ?? null,
            node_config: cluster.node_config ?? null,
            control_plane: cluster.control_plane ?? null,
            workers: cluster.workers ?? null,
            created_at: cluster.created_at ?? null,
          };
        })
        .filter((cluster) => cluster.id !== ""); // Filter out invalid entries

      return merged;
    } catch (err) {
      console.error(`[Clusters] Error in get_all_for_admin: ${err}`);
      return [];
    }
  },
};



export const Database_Clusters = {
 
  create:async(payload:Database )=>{
  


    //console.log(payload, "...........in createDatabaseClusterWorker........");
   const supabase = await createWorkerClient();
   const { data, error } = await supabase
     .from("database_cluster")
     .insert(payload)
     .select()
     .single();

       if (error) {
    console.error("[createClusterWorker] insert failed:", error.message);
    return { success: false, error: error.message };
  } 

 // console.log(data, "...........in createDatabaseClusterWorker........");

  return { success: true, data: data };
  },

  update_status: async(cluster_id:string, status:string, caCertificate:string | EncryptedData|null|undefined, public_connection:Database_Connection, private_connection:Database_Connection)=>{


   // console.log(caCertificate, "...........in updateDatabaseClusterWorker........");
  const supabase = await createWorkerClient();
   const { data, error } = await supabase
     .from("database_cluster")
     .update({ status, ca_certificate: caCertificate, public_connection, private_connection })
     .eq("cluster_id", cluster_id)
     .select("*")
     .single();
     //console.log(data, "...........in updateDatabaseClusterWorker........");

   if (error) {
     console.error("[updateClusterWorker] update failed:", error.message);
     return { success: false, error: error.message };
   }
   return { success: true, data: data };
},

  read: async(id:string)=>{
   const supabase = await createSSRClient();
   const { data, error } = await supabase
     .from("database_cluster")
     .select("*")
     .eq("cluster_id", id)
     .single();

   if (error) {
     console.error("[updateClusterWorker] update failed:", error.message);
     return { success: false, error: error.message };
   }
   return { success: true, data: data };
 },
  read_all_owner: async(owner_id:string)=>{
   const supabase = await createSSRClient();
   const { data, error } = await supabase
     .from("database_cluster")
     .select("*")
     .eq("owner_id", owner_id);

   if (error) {
     console.error("[updateClusterWorker] update failed:", error.message);
     return { success: false, error: error.message };
   }
   return { success: true, data: data };
 },

 read_all_owner_id: async(owner_id:string):Promise<Database[]>=>{
   const supabase = await createSSRClient();
   const { data, error } = await supabase
     .from("database_cluster")
     .select("*")
     .eq("owner_id", owner_id);

   if (error) {
     console.error("[updateClusterWorker] update failed:", error.message);
     return [];
   }
   return data;

   if (error) {
     return [];
   }
 },
  delete: async(cluster_id:string)=>{
   // console.log(cluster_id, "...........in deleteDatabaseClusterWorker........");
   const supabase = await createWorkerClient();
   const { data, error } = await supabase
     .from("database_cluster")
     .delete()
     .eq("cluster_id", cluster_id)
     .select();
    if (error) {
      console.error("[deleteClusterWorker] delete failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, cluster: data };
 },

  mark_as_deleted: async(cluster_id: string) => {
    const supabase = await createWorkerClient();
    const { data, error } = await supabase
      .from("database_cluster")
      .update({ status: "deleted" })
      .eq("cluster_id", cluster_id)
      .select("*")
      .single();
    
    if (error) {
      console.error("[mark_as_deleted] update failed:", error.message);
      return { success: false, error: error.message };
    }
    return { success: true, data: data };
  },

  update_network_rules: async(cluster_id:string, network_rules:network_rules)=>{


   // console.log(network_rules, "...........in updateDatabaseClusterWorker........");
  const supabase = await createWorkerClient();
   const { data, error } = await supabase
     .from("database_cluster")
     .update({ network_rules })
     .eq("cluster_id", cluster_id)
     .select("*")
     .single();
    // console.log(data, "...........in updateDatabaseClusterWorker........");

   if (error) {
     console.error("[updateClusterWorker] update failed:", error.message);
     return { success: false, error: error.message };
   }
   return { success: true, data: data };
},

  // Database user management functions
  add_user: async(cluster_id: string, user: DatabaseUser) => {
    //console.log(user, "...........in addDatabaseUser........");
    const supabase = await createWorkerClient();
    
    // First, get current users
    const { data: currentData, error: readError } = await supabase
      .from("database_cluster")
      .select("users")
      .eq("cluster_id", cluster_id)
      .single();

    if (readError) {
      console.error("[addDatabaseUser] read failed:", readError.message);
      return { success: false, error: readError.message };
    }

    const currentUsers = currentData?.users || [];
    const updatedUsers = [...currentUsers, user];

    // Update with new user added
    const { data, error } = await supabase
      .from("database_cluster")
      .update({ users: updatedUsers })
      .eq("cluster_id", cluster_id)
      .select("*")
      .single();

    if (error) {
      console.error("[addDatabaseUser] update failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data };
  },

  remove_user: async(cluster_id: string, username: string) => {
   // console.log(username, "...........in removeDatabaseUser........");
    const supabase = await createWorkerClient();
    
    // Get current users
    const { data: currentData, error: readError } = await supabase
      .from("database_cluster")
      .select("users")
      .eq("cluster_id", cluster_id)
      .single();

    if (readError) {
      console.error("[removeDatabaseUser] read failed:", readError.message);
      return { success: false, error: readError.message };
    }

    const currentUsers = currentData?.users || [];
    const updatedUsers = currentUsers.filter((u: DatabaseUser) => u.name !== username);

    // Update with user removed
    const { data, error } = await supabase
      .from("database_cluster")
      .update({ users: updatedUsers })
      .eq("cluster_id", cluster_id)
      .select("*")
      .single();

    if (error) {
      console.error("[removeDatabaseUser] update failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data };
  },

  update_users: async(cluster_id: string, users: DatabaseUser[]) => {
   // console.log(users, "...........in updateDatabaseUsers........");
    const supabase = await createWorkerClient();
    
    const { data, error } = await supabase
      .from("database_cluster")
      .update({ users })
      .eq("cluster_id", cluster_id)
      .select("*")
      .single();

    if (error) {
     // console.error("[updateDatabaseUsers] update failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data };
  },

  get_users: async(cluster_id: string) => {
    const supabase = await createSSRClient();
    
    const { data, error } = await supabase
      .from("database_cluster")
      .select("users")
      .eq("cluster_id", cluster_id)
      .single();

    if (error) {
      console.error("[getDatabaseUsers] read failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data?.users || [] };
  },

  // Database instance management functions
  add_db: async(cluster_id: string, database: DatabaseInstance) => {
    //console.log(database, "...........in addDatabase........");
    const supabase = await createWorkerClient();
    
    // First, get current databases
    const { data: currentData, error: readError } = await supabase
      .from("database_cluster")
      .select("dbs")
      .eq("cluster_id", cluster_id)
      .single();

    if (readError) {
      console.error("[addDatabase] read failed:", readError.message);
      return { success: false, error: readError.message };
    }

    const currentDbs = currentData?.dbs || [];
    const updatedDbs = [...currentDbs, database];

    // Update with new database added
    const { data, error } = await supabase
      .from("database_cluster")
      .update({ dbs: updatedDbs })
      .eq("cluster_id", cluster_id)
      .select("*")
      .single();

    if (error) {
      console.error("[addDatabase] update failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data };
  },

  remove_db: async(cluster_id: string, db_name: string) => {
    //console.log(db_name, "...........in removeDatabase........");
    const supabase = await createWorkerClient();
    
    // Get current databases
    const { data: currentData, error: readError } = await supabase
      .from("database_cluster")
      .select("dbs")
      .eq("cluster_id", cluster_id)
      .single(); 

    if (readError) {
      console.error("[removeDatabase] read failed:", readError.message);
      return { success: false, error: readError.message };
    }

    const currentDbs = currentData?.dbs || [];
    const updatedDbs = currentDbs.filter((db: DatabaseInstance) => db.name !== db_name);

    // Update with database removed
    const { data, error } = await supabase
      .from("database_cluster")
      .update({ dbs: updatedDbs })
      .eq("cluster_id", cluster_id)
      .select("*")
      .single();

    if (error) {
      console.error("[removeDatabase] update failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data };
  },

  update_dbs: async(cluster_id: string, databases: DatabaseInstance[]) => {
   // console.log(databases, "...........in updateDatabases........");
    const supabase = await createWorkerClient();
    
    const { data, error } = await supabase
      .from("database_cluster")
      .update({ dbs: databases })
      .eq("cluster_id", cluster_id)
      .select("*")
      .single();

    if (error) {
      //console.error("[updateDatabases] update failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data };
  },

  get_dbs: async(cluster_id: string) => {
    const supabase = await createSSRClient();
    
    const { data, error } = await supabase
      .from("database_cluster")
      .select("dbs")
      .eq("cluster_id", cluster_id)
      .single();

    if (error) {
      console.error("[getDatabases] read failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data?.dbs || [] };
  },

  // Update project assignment for database cluster
  update_project: async(cluster_id: string, project_id: string) => {
    //console.log(`[updateProject] cluster_id: ${cluster_id}, project_id: ${project_id}`);
    const supabase = await createWorkerClient();
    
    const { data, error } = await supabase
      .from("database_cluster")
      .update({ project_id })
      .eq("cluster_id", cluster_id)
      .select("*")
      .single();

    if (error) {
      console.error("[updateProject] update failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data };
  },

  // Update region and status for migration
  update_region: async(cluster_id: string, region: string, status: string = "migrating") => {
    //console.log(`[updateRegion] cluster_id: ${cluster_id}, region: ${region}, status: ${status}`);
    const supabase = await createWorkerClient();
    
    const { data, error } = await supabase
      .from("database_cluster")
      .update({ region, status })
      .eq("cluster_id", cluster_id)
      .select("*")
      .single();

    if (error) {
      console.error("[updateRegion] update failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data };
  },

  // Update maintenance window
  update_maintenance_window: async(cluster_id: string, window: { day: string, hour: string }) => {
    //console.log(`[updateMaintenanceWindow] cluster_id: ${cluster_id}, window:`, window);
    const supabase = await createWorkerClient();
    
    const { data, error } = await supabase
      .from("database_cluster")
      .update({ window })
      .eq("cluster_id", cluster_id)
      .select("*")
      .single();

    if (error) {
      console.error("[updateMaintenanceWindow] update failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data };
  },

  // Update storage tier (size)
  update_storage: async(cluster_id: string, size: string) => {
    //console.log(`[updateStorage] cluster_id: ${cluster_id}, size: ${size}`);
    const supabase = await createWorkerClient();
    
    const { data, error } = await supabase
      .from("database_cluster")
      .update({ size })
      .eq("cluster_id", cluster_id)
      .select("*")
      .single();

    if (error) {
      console.error("[updateStorage] update failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data };
  },

  // Update storage size in MiB
  update_storage_size: async(cluster_id: string, storage_size_mib: number) => {
    //console.log(`[updateStorageSize] cluster_id: ${cluster_id}, storage_size_mib: ${storage_size_mib}`);
    const supabase = await createWorkerClient();
    
    const { data, error } = await supabase
      .from("database_cluster")
      .update({ storage_size_mib })
      .eq("cluster_id", cluster_id)
      .select("*")
      .single();

    if (error) {
      console.error("[updateStorageSize] update failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data };
  },

  // Get all databases for admin panel
  get_all_for_admin: async (): Promise<Admin_Database[]> => {
    try {
      const supabase = await createServiceClient();
      
      // Get all database clusters with user profile data
      const { data: clusters, error } = await supabase
        .from("database_cluster")
        .select(`
          id,
          name,
          engine,
          version,
          region,
          cluster_id,
          status,
          owner_id,
          created_at,
          project_id,
          user_profiles!owner_id(username)
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.log(`[Database_Clusters] Error while getting all databases: ${error.message}`);
        return [];
      }

      if (!clusters || clusters.length === 0) return [];

      // Get auth users for emails
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
      
      if (authError) {
        console.log(`[Database_Clusters] Error while getting auth users: ${authError.message}`);
      }

      const emailMap = new Map(
        authUsers?.users?.map(u => [u.id, u.email]) || []
      );

      // Map and merge data with proper typing
      const merged: Admin_Database[] = clusters
        .map((cluster) => {
          // Safely access nested user_profiles
          const userProfile = Array.isArray(cluster.user_profiles)
            ? cluster.user_profiles[0]
            : cluster.user_profiles;

          return {
            id: cluster.id ?? "",
            name: cluster.name ?? "",
            engine: cluster.engine ?? "",
            version: cluster.version ?? null,
            region: cluster.region ?? null,
            cluster_id: cluster.cluster_id ?? "",
            status: cluster.status ?? "pending",
            owner_id: cluster.owner_id ?? "",
            owner_email: emailMap.get(cluster.owner_id ?? "") ?? null,
            owner_username: (userProfile)?.username ?? null,
            created_at: cluster.created_at ?? null,
            project_id: cluster.project_id ?? "",
          } as Admin_Database;
        })
        .filter((item): item is Admin_Database => Boolean(item));

      return merged;
    } catch (err) {
      console.log(`[Database_Clusters] Error while getting all databases: ${err}`);
      return [];
    }
  },

   get_by_project_id: async (projectId: string): Promise<Database[]>=> {
    try {
      //console.log(projectId,"..................933..id");


       if (!projectId || typeof projectId !== 'string') {
      console.error('[Clusters.get_by_project_id] Invalid project ID');
      return [];
    }


     const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      console.error('[Clusters.get_by_project_id] Invalid UUID format');
      return [];
    }

   const supabase = await createWorkerClient();
      const { data, error } = await supabase
        .from("database_cluster")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) {
        // console.log(
        //   `[Supabase] Error while getting project by id: ${error.message}`,
        // );
        return [];
      }
     // console.log(data, "...........data in database cluster by project id........");
      return data;
    } catch (err) {
      console.log(`[Supabase] Error while getting project by id: ${err}`);
      return [];
    }
  },
 

}

// Activities queries
export const Activities = {
  // Add a new activity
  add: async (
    props: TablesInsert<"activities">,
  ): Promise<{ success: boolean; id?: string; error?: string }> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("activities")
        .insert(props)
        .select("id")
        .single();

      if (error) {
        console.error(`[Activities.add] Error: ${error.message}`);
        return { success: false, error: error.message };
      }

      return { success: true, id: data.id };
    } catch (err) {
      console.error(`[Activities.add] Error: ${err}`);
      return {
        success: false,
        error: String(err),
      };
    }
  },

  // Get all activities for a project
  get_by_project_id: async (
    projectId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<Activity[]> => {
    try {
      if (!projectId || typeof projectId !== "string") {
        console.error("[Activities.get_by_project_id] Invalid project ID");
        return [];
      }

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(projectId)) {
        console.error("[Activities.get_by_project_id] Invalid UUID format");
        return [];
      }

      const supabase = await createClient();
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error(
          `[Activities.get_by_project_id] Error: ${error.message}`,
        );
        return [];
      }

      return data || [];
    } catch (err) {
      console.error(`[Activities.get_by_project_id] Error: ${err}`);
      return [];
    }
  },

  // Get activities by owner
  get_by_owner_id: async (
    ownerId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<Activity[]> => {
    try {
      if (!ownerId || typeof ownerId !== "string") {
        console.error("[Activities.get_by_owner_id] Invalid owner ID");
        return [];
      }

      const supabase = await createClient();
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error(`[Activities.get_by_owner_id] Error: ${error.message}`);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error(`[Activities.get_by_owner_id] Error: ${err}`);
      return [];
    }
  },
};

// Spectrum Apps query helpers
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
        .eq("spectrum_id", spectrum_id)
        .select();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
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
        console.error(`[Spectrum_Apps.get_by_project_id] Error: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error(`[Spectrum_Apps.get_by_project_id] Error: ${err}`);
      return [];
    }
  },

  // Admin methods
  get_all_for_admin: async (): Promise<Admin_SpectrumApp[]> => {
    try {
      const supabase = await createServiceClient();
      
      // Get all spectrum apps
      const { data: apps, error } = await supabase
        .from("spectrum_apps")
        .select(`
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
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.error(
          `[Spectrum_Apps] Error getting all apps for admin: ${error.message}`
        );
        return [];
      }

      if (!apps || apps.length === 0) return [];

      // Get auth users for emails
      const { data: authUsers, error: authError } =
        await supabase.auth.admin.listUsers();

      if (authError) {
        console.log(
          `[Spectrum_Apps] Error while getting auth users: ${authError.message}`
        );
      }

      const emailMap = new Map(
        authUsers?.users?.map((u) => [u.id, u.email]) || []
      );

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

  //get all app name for unique name check
   get_all_app_name: async (role:string) => {
    try {
      const supabase = await (role==='admin'? createSSRClient():createWorkerClient());
      const { data, error } = await supabase
        .from("spectrum_apps")
        .select("dns->>original_name")
        .order("created_at", { ascending: false });


        console.log(data, ".........check..data in get_all_app_name........");

        const names = data?.map(row => row.original_name);


        console.log(names, "...........data in get_all_app_name........");
      if (error) return [];
      return names || [];
    } catch {
      return [];
    }
  },
};




//All storage of files in s3 bucket and recieve the url to store in database

export const storeFile=async(clusterId:string, file:File)=>{

  const path = `clusters/${clusterId}/${Date.now()}-${file.name}`;
  const supabase = await createSSRClient();
  const { error: uploadError } = await supabase
    .storage
    .from('kubeconfigs')   // bucket name
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type
    });

    if (uploadError) throw uploadError;

  return { path }; 
}




// function makeNodeKeys(workers: number): string[] {
//   const n = Math.max(0, Math.floor(workers)); // sanitize
//   const keys = ["cp-1"];
//   for (let i = 1; i <= n; i++) keys.push(`wp-${i}`);
//   return keys;
// }









export const ObjectSpaces = {
  // Bucket operations only (access keys from .env)
  delete: async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log(id, "...........id in delete object space........");
      const supabase = await createWorkerClient();
      const { error } = await supabase
        .from("object_spaces")
        .delete()
        .eq("id", id);

      if (error) {
        console.error(`[ObjectSpaces] Error deleting: ${error.message}`);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err) {
      console.error(`[ObjectSpaces] Error deleting: ${err}`);
      return { success: false, error: String(err) };
    }
  },

  update_status: async (
    id: string,
    status: ObjectSpaceBucket["status"]
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = await createWorkerClient();
      const { error } = await supabase
        .from("object_spaces")
        .update({ status })
        .eq("id", id);

      if (error) {
        console.error(`[ObjectSpaces] Error updating status: ${error.message}`);
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err) {
      console.error(`[ObjectSpaces] Error updating status: ${err}`);
      return { success: false, error: String(err) };
    }
  },

  create_bucket: async (
    payload: Omit<ObjectSpaceBucket, "id" | "created_at" | "updated_at">
  ): Promise<{
    success: boolean;
    data?: ObjectSpaceBucket;
    error?: string;
  }> => {
    try {
      const supabase = await createWorkerClient();
      const { data, error } = await supabase
        .from("object_spaces")
        .insert({
          ...payload,
          type: "bucket",
        })
        .select()
        .single();

      if (error) {
        console.error(`[ObjectSpaces] Error creating bucket: ${error.message}`);
        return { success: false, error: error.message };
      }
      return { success: true, data: data as ObjectSpaceBucket };
    } catch (err) {
      console.error(`[ObjectSpaces] Error creating bucket: ${err}`);
      return { success: false, error: String(err) };
    }
  },

  get_buckets: async (owner_id: string): Promise<ObjectSpaceBucket[]> => {
    try {
      const supabase = await createSSRClient();
      const { data, error } = await supabase
        .from("object_spaces")
        .select("*")
        .eq("owner_id", owner_id)
        .eq("type", "bucket")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(`[ObjectSpaces] Error getting buckets: ${error.message}`);
        return [];
      }
      return (data as ObjectSpaceBucket[]) || [];
    } catch (err) {
      console.error(`[ObjectSpaces] Error getting buckets: ${err}`);
      return [];
    }
  },
  get_all_buckets: async (): Promise<ObjectSpaceBucket[]> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("object_spaces")
        .select("name")
        .eq("type", "bucket")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(`[ObjectSpaces] Error getting buckets: ${error.message}`);
        return [];
      }
      return (data as ObjectSpaceBucket[]) || [];
    } catch (err) {
      console.error(`[ObjectSpaces] Error getting buckets: ${err}`);
      return [];
    }
  },

  get_by_project_id: async (projectId: string): Promise<ObjectSpaceBucket[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("object_spaces")
        .select("*")
        .eq("project_id", projectId)
        .eq("type", "bucket")
        .neq("status", "deleted")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(`[ObjectSpaces.get_by_project_id] Error: ${error.message}`);
        return [];
      }
      return (data as ObjectSpaceBucket[]) || [];
    } catch (err) {
      console.error(`[ObjectSpaces.get_by_project_id] Error: ${err}`);
      return [];
    }
  },

  get_bucket_by_bucket_id: async (
    id: string,
    is_admin: boolean = false
  ): Promise<ObjectSpaceBucket | null> => {
    try {
      // console.log(id, "...........bucket_id in get_bucket_by_bucket_id........");
      const supabase = is_admin ? await createWorkerClient() : await createSSRClient();
      const { data, error } = await supabase
        .from("object_spaces")
        .select("*")
        .eq("id", id)
        .eq("type", "bucket")
        .single();

      if (error) {
        console.error(
          `[ObjectSpaces] 
          : ${error.message}`
        );
        return null;
      }
      return data as ObjectSpaceBucket;
    } catch (err) {
      console.error(`[ObjectSpaces] Error getting bucket by bucket_id: ${err}`);
      return null;
    }
  },

  get_bucket_by_id: async (id: string): Promise<ObjectSpaceBucket | null> => {
    try {
      const supabase = await createSSRClient();
      const { data, error } = await supabase
        .from("object_spaces")
        .select("*")
        .eq("id", id)
        .eq("type", "bucket")
        .single();

      if (error) {
        console.error(
          `[ObjectSpaces] Error getting bucket by id: ${error.message}`
        );
        return null;
      }
      return data as ObjectSpaceBucket;
    } catch (err) {
      console.error(`[ObjectSpaces] Error getting bucket by id: ${err}`);
      return null;
    }
  },

  update_bucket_stats: async (
    id: string,
    size_bytes: number,
    object_count: number
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = await createWorkerClient();
      const { error } = await supabase
        .from("object_spaces")
        .update({ size_bytes, object_count })
        .eq("id", id)
        .eq("type", "bucket");

      if (error) {
        console.error(
          `[ObjectSpaces] Error updating bucket stats: ${error.message}`
        );
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err) {
      console.error(`[ObjectSpaces] Error updating bucket stats: ${err}`);
      return { success: false, error: String(err) };
    }
  },

  update_bucket_settings: async (
    id: string,
    settings: Partial<
      Pick<
        ObjectSpaceBucket,
        "acl" | "cors_enabled" | "versioning_enabled" | "project_id"
      >
    >
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = await createWorkerClient();
      const { error } = await supabase
        .from("object_spaces")
        .update(settings)
        .eq("id", id)
        .eq("type", "bucket");

      if (error) {
        console.error(
          `[ObjectSpaces] Error updating bucket settings: ${error.message}`
        );
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err) {
      console.error(`[ObjectSpaces] Error updating bucket settings: ${err}`);
      return { success: false, error: String(err) };
    }
  },

  // Admin methods
  get_all_for_admin: async (): Promise<Admin_Bucket[]> => {
    try {
      const supabase = await createServiceClient();
      
      // Get all object storage buckets
      const { data: buckets, error } = await supabase
        .from("object_spaces")
        .select(`
          id,
          name,
          size_bytes,
          object_count,
          region,
          status,
          created_at,
          project_id,
          owner_id,
          user_profiles(username)
        `)
        .eq("type", "bucket")
        .order("created_at", { ascending: false });

      //console.log(buckets, "...........data in get_all_for_admin........");

      if (error) {
        console.error(
          `[ObjectSpaces] Error getting all buckets for admin: ${error.message}`
        );
        return [];
      }

      if (!buckets || buckets.length === 0) return [];

      // Get auth users for emails
      const { data: authUsers, error: authError } =
        await supabase.auth.admin.listUsers();

      if (authError) {
        console.log(
          `[ObjectSpaces] Error while getting auth users: ${authError.message}`
        );
      }

      const emailMap = new Map(
        authUsers?.users?.map((u) => [u.id, u.email]) || []
      );

      // Map and merge data with proper typing
      const merged: Admin_Bucket[] = buckets
        .map((bucket) => {
          // Safely access nested user_profiles
          const userProfile = Array.isArray(bucket.user_profiles)
            ? bucket.user_profiles[0]
            : bucket.user_profiles;

          return {
            id: bucket.id ?? "",
            name: bucket.name ?? "",
            size: bucket.size_bytes ?? 0,
            object_count: bucket.object_count ?? 0,
            region: bucket.region ?? null,
            status: bucket.status ?? "pending",
            owner_id: bucket.owner_id ?? "",
            owner_email: emailMap.get(bucket.owner_id ?? "") ?? null,
            owner_username: userProfile?.username ?? null,
            created_at: bucket.created_at ?? null,
            project_id: bucket.project_id ?? "",
          } as Admin_Bucket;
        })
        .filter((item): item is Admin_Bucket => Boolean(item));

      return merged;
    } catch (err) {
      console.error(
        `[ObjectSpaces] Error getting all buckets for admin: ${err}`
      );
      return [];
    }
  },
};

// Platform Apps query helpers
// Note: Types will be available after running supabase gen types
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
// Platform App Deployments Queries (History)
// ============================================
export const Platform_App_Deployments = {
  create: async (payload: {
    app_id: string;
    build_number?: number | null;
    commit_sha?: string | null;
    image_tag?: string | null;
    image_digest?: string | null;
    status: 'success' | 'failed';
    trigger: 'manual' | 'webhook' | 'rollback';
  }) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from('platform_app_deployments')
        .insert({
          app_id: payload.app_id,
          build_number: payload.build_number ?? null,
          commit_sha: payload.commit_sha ?? null,
          image_tag: payload.image_tag ?? null,
          image_digest: payload.image_digest ?? null,
          status: payload.status,
          trigger: payload.trigger,
        })
        .select('*')
        .single();

      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  list_by_app: async (app_id: string, limit = 20) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from('platform_app_deployments')
        .select('*')
        .eq('app_id', app_id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error(`[Platform_App_Deployments] Error listing deployments: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error(`[Platform_App_Deployments] Error listing deployments: ${err}`);
      return [];
    }
  },

  get_latest_successful: async (app_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from('platform_app_deployments')
        .select('*')
        .eq('app_id', app_id)
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) return { success: false, error: error.message };
      return { success: true, data: data || null };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  get_previous_successful: async (app_id: string, exclude_deployment_id?: string | null) => {
    try {
      const supabase = await createServiceClient();
      let query = supabase
        .from('platform_app_deployments')
        .select('*')
        .eq('app_id', app_id)
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(5);

      if (exclude_deployment_id) {
        query = query.neq('id', exclude_deployment_id);
      }

      const { data, error } = await query;
      if (error) return { success: false, error: error.message };

      const previous = (data || [])[0] || null;
      return { success: true, data: previous };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  set_active_for_app: async (app_id: string, deployment_id: string | null) => {
    return Platform_Apps.update(app_id, { active_deployment_id: deployment_id });
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

// ============================================
// GitLab Tokens Queries
// ============================================
export const GitLab_Tokens = {
  // Get the GitLab token row for a user (service-role)
  get_by_user: async (user_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("gitlab_tokens")
        .select("*")
        .eq("user_id", user_id)
        .single();

      if (error) {
        console.error(`[GitLab_Tokens] Error getting token for user ${user_id}: ${error.message}`);
        return null;
      }

      return data;
    } catch (err) {
      console.error(`[GitLab_Tokens] Error getting token for user ${user_id}: ${err}`);
      return null;
    }
  },

  // Upsert (insert or update) a GitLab token row
  upsert: async (payload: {
    user_id: string;
    access_token: string;
    refresh_token: string | null;
    expires_at: string | null;
    gitlab_username: string;
    gitlab_user_id: number;
    scopes: string;
  }) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("gitlab_tokens")
        .upsert({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error("[GitLab_Tokens] Failed to upsert token:", error.message);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (err) {
      console.error("[GitLab_Tokens] Error upserting token:", err);
      return { success: false, error: String(err) };
    }
  },

  // Delete token row for a user
  delete_for_user: async (user_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase
        .from("gitlab_tokens")
        .delete()
        .eq("user_id", user_id);

      if (error) {
        console.error(`[GitLab_Tokens] Failed to delete token for user ${user_id}: ${error.message}`);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      console.error(`[GitLab_Tokens] Error deleting token for user ${user_id}: ${err}`);
      return { success: false, error: String(err) };
    }
  },
};

// Re-export from the queries folder for backward compatibility
export { Billing } from "./queries/billing";
export { Promocodes } from "./queries/promocodes";

// Export the queries object for backward compatibility
const api = {
  users: Users,
  projects: Projects,
  gameservers: GameServers,
  products: Products,
  locations: Locations,
  otps: OTPs,
  // vms:Vms,
  clusters:Clusters,
  database_clusters:Database_Clusters,
  activities: Activities,
  object_spaces: ObjectSpaces,
};

export default api;
