import { createClient } from "../server";
import { handleQueryError } from "@/lib/utils/error-handler";
import { Tables, TablesInsert, TablesUpdate } from "../types";

type GameServer = Tables<"game_servers">;

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
        handleQueryError("getting game server by id", error, "GameServers");
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError("getting game server by id", err, "GameServers");
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
        handleQueryError("getting game servers by user", error, "GameServers");
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError("getting game servers by user", err, "GameServers");
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
        handleQueryError(
          "getting game servers by project",
          error,
          "GameServers"
        );
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError("getting game servers by project", err, "GameServers");
      return [];
    }
  },

  create: async (
    props: TablesInsert<"game_servers">
  ): Promise<number | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("game_servers")
        .insert(props)
        .select("id")
        .single();

      if (error) {
        handleQueryError("creating game server", error, "GameServers");
        return null;
      }
      return data.id;
    } catch (err) {
      handleQueryError("creating game server", err, "GameServers");
      return null;
    }
  },

  update: async (
    id: number,
    props: TablesUpdate<"game_servers">
  ): Promise<boolean> => {
    try {
      const supabase = await createClient();
      const { error } = await supabase
        .from("game_servers")
        .update(props)
        .eq("id", id);

      if (error) {
        handleQueryError("updating game server", error, "GameServers");
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError("updating game server", err, "GameServers");
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
        handleQueryError("deleting game server", error, "GameServers");
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError("deleting game server", err, "GameServers");
      return false;
    }
  },
};
