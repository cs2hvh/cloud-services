import { createClient } from "./server";
import { createServiceClient } from "./server";
import {  Tables, TablesInsert, TablesUpdate } from "./types";

type UserProfile = Tables<"user_profiles">;
type Project = Tables<"projects">;
type ProjectLog = Tables<"project_logs">;
type GameServer = Tables<"game_servers">;
type Product = Tables<"products">;
type Location = Tables<"locations">;
type OTP = Tables<"otps">;

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
        console.log(
          `[Supabase] Error while getting user by email: ${authError.message}`,
        );
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
        .or(`owner.eq.${userId},users.cs.["${userId}"]`);

      if (error) {
        console.log(
          `[Supabase] Error while getting projects by userId: ${error.message}`,
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

  add_log: async (props: TablesInsert<"project_logs">): Promise<boolean> => {
    try {
      const supabase = await createClient();
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
};

export const Locations = {
  get_all: async (): Promise<Location[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .eq("available", true)
        .order("city");

      if (error) {
        console.log(
          `[Supabase] Error while getting locations: ${error.message}`,
        );
        return [];
      }
      return data || [];
    } catch (err) {
      console.log(`[Supabase] Error while getting locations: ${err}`);
      return [];
    }
  },
};

export const OTPs = {
  create: async (props: TablesInsert<"otps">): Promise<number | null> => {
    try {
      const supabase = await createClient();
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
};

// Export the queries object for backward compatibility
const api = {
  users: Users,
  projects: Projects,
  gameservers: GameServers,
  products: Products,
  locations: Locations,
  otps: OTPs,
};

export default api;

