import { createClient, createServiceClient } from "../server";
import { handleQueryError } from "@/lib/utils/error-handler";
import { Tables, TablesInsert, TablesUpdate } from "../types";

type Product = Tables<"products">;

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
        handleQueryError("getting product by id", error, "Products");
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError("getting product by id", err, "Products");
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
        handleQueryError("getting all products", error, "Products");
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError("getting all products", err, "Products");
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
        handleQueryError("getting products by type", error, "Products");
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError("getting products by type", err, "Products");
      return [];
    }
  },

  get_by_type_and_subtype: async (
    type: string,
    subtype: string
  ): Promise<Product[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("type", type)
        .eq("sub", subtype)
        .order("created_at", { ascending: false });

      if (error) {
        handleQueryError(
          "getting products by type and subtype",
          error,
          "Products"
        );
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError("getting products by type and subtype", err, "Products");
      return [];
    }
  },

  create: async (
    props: TablesInsert<"products">
  ): Promise<{ success: boolean; data?: Product; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("products")
        .insert(props)
        .select("*")
        .single();

      if (error) {
        handleQueryError("creating product", error, "Products");
        return { success: false, error: error.message };
      }
      return { success: true, data };
    } catch (err) {
      handleQueryError("creating product", err, "Products");
      return { success: false, error: String(err) };
    }
  },

  update: async (
    id: string,
    props: TablesUpdate<"products">
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
        handleQueryError("updating product", error, "Products");
        return { success: false, error: error.message };
      }
      return { success: true, data };
    } catch (err) {
      handleQueryError("updating product", err, "Products");
      return { success: false, error: String(err) };
    }
  },

  delete: async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase.from("products").delete().eq("id", id);

      if (error) {
        handleQueryError("deleting product", error, "Products");
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err) {
      handleQueryError("deleting product", err, "Products");
      return { success: false, error: String(err) };
    }
  },

  check_usage: async (
    id: string
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
        handleQueryError("checking product usage", error, "Products");
        return { inUse: false, count: 0 };
      }

      return { inUse: (count || 0) > 0, count: count || 0 };
    } catch (err) {
      handleQueryError("checking product usage", err, "Products");
      return { inUse: false, count: 0 };
    }
  },
};
