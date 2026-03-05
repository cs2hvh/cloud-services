import { createWorkerClient, createSSRClient, createClient, createServiceClient } from "../server";
import { ObjectSpaceBucket, Admin_Bucket } from "../types";

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

  mark_as_deleted: async (
    id: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log(id, "...........id in mark_as_deleted object space........");
      const supabase = await createWorkerClient();
      const { error } = await supabase
        .from("object_spaces")
        .update({ status: "deleted" })
        .eq("id", id);

      if (error) {
        console.error(
          `[ObjectSpaces] Error marking as deleted: ${error.message}`
        );
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err) {
      console.error(`[ObjectSpaces] Error marking as deleted: ${err}`);
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
        .insert(
          payload
        )
        .select()
        .single();

      if (error) {
        //console.error(`[ObjectSpaces] Error creating bucket: ${error.message}`);
        return { success: false, error: error.message };
      }
      return { success: true, data: data as ObjectSpaceBucket };
    } catch (err) {
      //console.error(`[ObjectSpaces] Error creating bucket: ${err}`);
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
        .neq("status", "deleted")
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

  get_by_project_id: async (
    projectId: string
  ): Promise<ObjectSpaceBucket[]> => {
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
        console.error(
          `[ObjectSpaces.get_by_project_id] Error: ${error.message}`
        );
        return [];
      }
      return (data as ObjectSpaceBucket[]) || [];
    } catch (err) {
      console.error(`[ObjectSpaces.get_by_project_id] Error: ${err}`);
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
        .neq("status", "deleted")
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

  get_bucket_by_bucket_id: async (
    id: string,
    is_admin: boolean = false
  ): Promise<ObjectSpaceBucket | null> => {
    try {
      // console.log(id, "...........bucket_id in get_bucket_by_bucket_id........");
      const supabase = is_admin
        ? await createWorkerClient()
        : await createSSRClient();
      const { data, error } = await supabase
        .from("object_spaces")
        .select("*")
        .eq("id", id)
        .eq("type", "bucket")
        .neq("status", "deleted")
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
        .neq("status", "deleted")
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

  get_bucket_by_name: async (name: string): Promise<ObjectSpaceBucket | null> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("object_spaces")
        .select("*")
        .eq("name", name)
        .eq("type", "bucket")
        .neq("status", "deleted")
        .maybeSingle();

      if (error) {
        console.error(`[ObjectSpaces] Error getting bucket by name: ${error.message}`);
        return null;
      }
      return (data as ObjectSpaceBucket) || null;
    } catch (err) {
      console.error(`[ObjectSpaces] Error getting bucket by name: ${err}`);
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
        .select(
          `
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
        `
        )
        .eq("type", "bucket")
        .neq("status", "deleted")
        .order("created_at", { ascending: false });

      //console.log(buckets, "...........data in get_all_for_admin........");

      if (error) {
        console.error(
          `[ObjectSpaces] Error getting all buckets for admin: ${error.message}`
        );
        return [];
      }

      if (!buckets || buckets.length === 0) return [];

      // Get unique owner IDs to minimize auth queries
      const uniqueOwnerIds = [
        ...new Set(buckets.map((b) => b.owner_id).filter(Boolean)),
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
