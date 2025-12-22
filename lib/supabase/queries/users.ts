import { createClient, createServiceClient } from "../server";
import { handleQueryError } from "@/lib/utils/error-handler";
import { Tables, TablesInsert, TablesUpdate, Admin_User } from "../types";

type UserProfile = Tables<"user_profiles">;

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
        handleQueryError("Get user by ID", error, "Users");
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError("Get user by ID", err, "Users");
      return null;
    }
  },

  get_by_email: async (
    email: string
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
        handleQueryError("Get user profile by email", profileError, "Users");
        return null;
      }

      return { ...profile, email: user.email || "" };
    } catch (err) {
      handleQueryError("Get user by email", err, "Users");
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
        handleQueryError("Get all users", error, "Users");
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError("Get all users", err, "Users");
      return [];
    }
  },
  get_all_profiles: async (): Promise<Admin_User[]> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("user_profiles")
        .select(
          `
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
        `
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.log(
          `[Supabase] Error while getting all users: ${error.message}`
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
        email: authUsers?.users.find((a) => a.id === u.id)?.email || null,
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
        handleQueryError("Get user by discord", error, "Users");
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError("Get user by discord", err, "Users");
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
        handleQueryError("Get user by steam", error, "Users");
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError("Get user by steam", err, "Users");
      return null;
    }
  },

  update_password: async (
    userId: string,
    newPassword: string
  ): Promise<boolean> => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        password: newPassword,
      });

      if (error) {
        handleQueryError("Update user password", error, "Users");
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError("Update user password", err, "Users");
      return false;
    }
  },

  // Create a new user profile (called automatically by trigger)
  create: async (
    props: TablesInsert<"user_profiles">
  ): Promise<string | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("user_profiles")
        .insert(props)
        .select("id")
        .single();

      if (error) {
        handleQueryError("Create user profile", error, "Users");
        return null;
      }
      return data.id;
    } catch (err) {
      handleQueryError("Create user profile", err, "Users");
      return null;
    }
  },

  // Update an existing user
  update: async (
    id: string,
    props: TablesUpdate<"user_profiles">
  ): Promise<boolean> => {
    try {
      const supabase = await createClient();
      const { error } = await supabase
        .from("user_profiles")
        .update(props)
        .eq("id", id);

      if (error) {
        handleQueryError("Update user", error, "Users");
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError("Update user", err, "Users");
      return false;
    }
  },

  // Delete a user by ID
  delete: async (userId: string): Promise<boolean> => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase.auth.admin.deleteUser(userId);

      if (error) {
        handleQueryError("Delete user", error, "Users");
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError("Delete user", err, "Users");
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
        handleQueryError("Count users", error, "Users");
        return 0;
      }
      return count || 0;
    } catch (err) {
      handleQueryError("Count users", err, "Users");
      return 0;
    }
  },
};
