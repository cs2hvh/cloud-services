import { createClient } from "../server";
import { Tables, TablesInsert } from "../types";

type Activity = Tables<"activities">;

export const Activities = {
  // Add a new activity
  add: async (
    props: TablesInsert<"activities">
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
    offset: number = 0
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
        console.error(`[Activities.get_by_project_id] Error: ${error.message}`);
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
    offset: number = 0
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
