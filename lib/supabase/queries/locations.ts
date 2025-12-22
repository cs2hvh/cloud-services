import { createClient, createSSRClient } from "../server";
import { handleQueryError } from "@/lib/utils/error-handler";
import { Tables } from "../types";

type Location = Tables<"locations">;

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
        handleQueryError("getting locations", error, "Locations");
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError("getting locations", err, "Locations");
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
        handleQueryError("getting locations by type", error, "Locations");
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError("getting locations by type", err, "Locations");
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
      handleQueryError("inserting location", error, "Locations");
      return { success: false, error: error.message };
    }

    return { success: true, data: data };
  },
};
