import { createWorkerClient, createSSRClient, createServiceClient } from "../server";
import {
  network_rules,
  EncryptedData,
  Database_Connection,
  DatabaseUser,
  DatabaseInstance,
  Admin_Database,
} from "../types";
import { UUID } from "crypto";

type Database = {
  id?: string;
  name: string;
  engine: string;
  version?: string | null;
  region?: string;
  cluster_id?: UUID;
  status: "pending" | "online" | "creating" | "migrating" | "resizing" | "deleted";
  owner_id: string;
  created_at?: string;
  project_id: string;
  size: string;
  storage_size_mib?: number;
  ca_certificate?: string | EncryptedData;
  public_connection?: Database_Connection;
  private_connection?: Database_Connection;
  network_rules?: network_rules;
  users?: DatabaseUser[];
  dbs?: DatabaseInstance[];
  window?: { day: string; hour: string };
  password: string | EncryptedData;
  num_nodes?: number;
};

export const Database_Clusters = {
  create: async (payload: Database) => {
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

  update_pgvector_applied: async (clusterId: string) => {
    const supabase = await createWorkerClient();
    const { error } = await supabase
      .from("database_cluster")
      .update({ pgvector_applied_at: new Date().toISOString() })
      .eq("id", clusterId);
    if (error) {
      console.error("[update_pgvector_applied] update failed:", error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  },

  update_status: async (
    cluster_id: string,
    status: string,
    caCertificate: string | EncryptedData | null | undefined,
    public_connection: Database_Connection,
    private_connection: Database_Connection
  ) => {
    // console.log(caCertificate, "...........in updateDatabaseClusterWorker........");
    const supabase = await createWorkerClient();
    const { data, error } = await supabase
      .from("database_cluster")
      .update({
        status,
        ca_certificate: caCertificate,
        public_connection,
        private_connection,
      })
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

  // Update public and private connection details (used when user password is reset)
  update_connections: async (
    cluster_id: string,
    public_connection: Database_Connection,
    private_connection: Database_Connection
  ) => {
    const supabase = await createWorkerClient();
    const { data, error } = await supabase
      .from("database_cluster")
      .update({
        public_connection,
        private_connection,
      })
      .eq("cluster_id", cluster_id)
      .select("*")
      .single();

    if (error) {
      console.error("[update_connections] update failed:", error.message);
      return { success: false, error: error.message };
    }
    return { success: true, data: data };
  },

  read: async (id: string) => {
    const supabase = await createSSRClient();
    const { data: byClusterId, error: clusterIdError } = await supabase
      .from("database_cluster")
      .select("*")
      .eq("cluster_id", id)
      .maybeSingle();

    if (clusterIdError) {
      console.error("[readCluster] read by cluster_id failed:", clusterIdError.message);
      return { success: false, error: clusterIdError.message };
    }

    if (byClusterId) {
      return { success: true, data: byClusterId };
    }

    const { data: byInternalId, error: internalIdError } = await supabase
      .from("database_cluster")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (internalIdError) {
      console.error("[readCluster] read by id failed:", internalIdError.message);
      return { success: false, error: internalIdError.message };
    }

    if (!byInternalId) {
      return { success: false, error: "Database cluster not found" };
    }

    return { success: true, data: byInternalId };
  },
  read_all_owner: async (owner_id: string) => {
    const supabase = await createSSRClient();
    const { data, error } = await supabase
      .from("database_cluster")
      .select("*")
      .eq("owner_id", owner_id)
      .neq("status", "deleted");

    if (error) {
      console.error("[readAllOwner] read failed:", error.message);
      return { success: false, error: error.message };
    }
    return { success: true, data: data };
  },

  read_all_owner_id: async (owner_id: string): Promise<Database[]> => {
    const supabase = await createSSRClient();
    const { data, error } = await supabase
      .from("database_cluster")
      .select("*")
      .eq("owner_id", owner_id)
      .neq("status", "deleted");

    if (error) {
      console.error("[read_all_owner_id] query failed:", error.message);
      return [];
    }
    return data as Database[];
  },
  delete: async (cluster_id: string) => {
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

  mark_as_deleted: async (cluster_id: string) => {
    // console.log(cluster_id, "...........in mark_as_deleted........");
    const supabase = await createWorkerClient();
    const { data, error } = await supabase
      .from("database_cluster")
      .update({ status: "deleted" })
      .eq("cluster_id", cluster_id)
      .select();
    if (error) {
      console.error("[mark_as_deleted] update failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, cluster: data };
  },

  update_network_rules: async (
    cluster_id: string,
    network_rules: network_rules
  ) => {
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
  add_user: async (cluster_id: string, user: DatabaseUser) => {
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

  remove_user: async (cluster_id: string, username: string) => {
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
    const updatedUsers = currentUsers.filter(
      (u: DatabaseUser) => u.name !== username
    );

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

  update_users: async (cluster_id: string, users: DatabaseUser[]) => {
    const supabase = await createWorkerClient();

    const { data, error } = await supabase
      .from("database_cluster")
      .update({ users })
      .eq("cluster_id", cluster_id)
      .select("*")
      .single();

    if (error) {
       console.error("[updateDatabaseUsers] update failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, data: data };
  },

  get_users: async (cluster_id: string) => {
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
  add_db: async (cluster_id: string, database: DatabaseInstance) => {
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

  remove_db: async (cluster_id: string, db_name: string) => {
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
    const updatedDbs = currentDbs.filter(
      (db: DatabaseInstance) => db.name !== db_name
    );

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

  update_dbs: async (cluster_id: string, databases: DatabaseInstance[]) => {
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

  get_dbs: async (cluster_id: string) => {
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
  update_project: async (cluster_id: string, project_id: string) => {
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
  update_region: async (
    cluster_id: string,
    region: string,
    status: string = "migrating"
  ) => {
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
  update_maintenance_window: async (
    cluster_id: string,
    window: { day: string; hour: string }
  ) => {
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
  update_storage: async (cluster_id: string, size: string) => {
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

  update_storage_size: async (cluster_id: string, storage_size_mib: number) => {
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
        .select(
          `
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
        `
        )
        .neq("status", "deleted")
        .order("created_at", { ascending: false });

      if (error) {
        console.log(
          `[Database_Clusters] Error while getting all databases: ${error.message}`
        );
        return [];
      }

      if (!clusters || clusters.length === 0) return [];

      // Get unique owner IDs to minimize auth queries
      const uniqueOwnerIds = [
        ...new Set(clusters.map((c) => c.owner_id).filter(Boolean)),
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
            owner_username: userProfile?.username ?? null,
            created_at: cluster.created_at ?? null,
            project_id: cluster.project_id ?? "",
          } as Admin_Database;
        })
        .filter((item): item is Admin_Database => Boolean(item));

      return merged;
    } catch (err) {
      console.log(
        `[Database_Clusters] Error while getting all databases: ${err}`
      );
      return [];
    }
  },

  get_by_project_id: async (projectId: string): Promise<Database[]> => {
    try {
      //console.log(projectId,"..................933..id");

      if (!projectId || typeof projectId !== "string") {
        console.error("[Clusters.get_by_project_id] Invalid project ID");
        return [];
      }

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(projectId)) {
        console.error("[Clusters.get_by_project_id] Invalid UUID format");
        return [];
      }

      const supabase = await createWorkerClient();
      const { data, error } = await supabase
        .from("database_cluster")
        .select("*")
        .eq("project_id", projectId)
        .neq("status", "deleted")
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
};
