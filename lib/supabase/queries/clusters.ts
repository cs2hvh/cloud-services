import { createWorkerClient, createServiceClient } from "../server";
import { handleQueryError } from "@/lib/utils/error-handler";
import { Tables, Admin_KubernetesCluster } from "../types";

type ClustersGet = Tables<"clusters_get">;

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

  get_by_project_id: async (projectId: string): Promise<ClustersGet[]> => {
    try {
      //console.log(projectId,"..................933..id");

      if (!projectId || typeof projectId !== "string") {
        handleQueryError(
          "getting project by id - invalid project ID",
          new Error("Invalid project ID"),
          "Clusters"
        );
        return [];
      }

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(projectId)) {
        handleQueryError(
          "getting project by id - invalid UUID format",
          new Error("Invalid UUID format"),
          "Clusters"
        );
        return [];
      }

      const supabase = await createWorkerClient();
      const { data, error } = await supabase
        .from("clusters")
        .select("*")
        .eq("project_id", projectId)
        .neq("status", "deleted")
        .order("created_at", { ascending: false });

      if (error) {
        handleQueryError("getting clusters by project id", error, "Clusters");
        return [];
      }
      return data;
    } catch (err) {
      handleQueryError("getting clusters by project id", err, "Clusters");
      return [];
    }
  },

  get_by_user_id: async (userId: string): Promise<ClustersGet[]> => {
    try {
      //console.log(projectId,"..................933..id");

      if (!userId || typeof userId !== "string") {
        handleQueryError(
          "getting clusters by user id - invalid user ID",
          new Error("Invalid user ID"),
          "Clusters"
        );
        return [];
      }

      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(userId)) {
        handleQueryError(
          "getting clusters by user id - invalid UUID format",
          new Error("Invalid UUID format"),
          "Clusters"
        );
        return [];
      }

      const supabase = await createWorkerClient();
      const { data, error } = await supabase
        .from("clusters")
        .select("*")
        .eq("owner_id", userId)
        .neq("status", "deleted")
        .order("created_at", { ascending: false });

      if (error) {
        handleQueryError("getting clusters by user id", error, "Clusters");
        return [];
      }
      return data;
    } catch (err) {
      handleQueryError("getting clusters by user id", err, "Clusters");
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
        handleQueryError("getting cluster by id", error, "Clusters");
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError("getting cluster by id", err, "Clusters");
      return null;
    }
  },

  get_all_for_admin: async (): Promise<Admin_KubernetesCluster[]> => {
    try {
      const supabase = await createServiceClient();

      // Get all clusters
      const { data: clusters, error } = await supabase
        .from("clusters")
        .select(
          `
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
        `
        )
        .neq("status", "deleted")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(
          `[Clusters] Error getting all for admin: ${error.message}`
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

  /**
   * Create a new Kubernetes cluster
   */
  create: async (clusterData: {
    cluster_id: string;
    cluster_name: string;
    status: string;
    owner_id: string;
    project_id?: string;
    kubeconfig?: string | null;
    k8s_version?: string;
    create_status?: boolean;
    connect_status?: boolean;
    verify_status?: boolean;
    node_config?: Record<string, unknown>;
  }): Promise<{ success: boolean; data?: any; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      
      const { data, error } = await supabase
        .from("clusters")
        .insert({
          cluster_id: clusterData.cluster_id,
          cluster_name: clusterData.cluster_name,
          status: clusterData.status || "pending",
          owner_id: clusterData.owner_id,
          project_id: clusterData.project_id || null,
          kubeconfig: clusterData.kubeconfig || null,
          k8s_version: clusterData.k8s_version || null,
          create_status: clusterData.create_status ?? false,
          connect_status: clusterData.connect_status ?? false,
          verify_status: clusterData.verify_status ?? false,
          node_config: clusterData.node_config || null,
        })
        .select()
        .single();

      if (error) {
        console.error("[Clusters] Insert failed:", error.message);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[Clusters] Create error:", errorMessage);
      return { success: false, error: errorMessage };
    }
  },

  /**
   * Update a Kubernetes cluster
   */
  update: async (
    cluster_id: string,
    updates: {
      status?: string;
      project_id?: string;
      kubeconfig?: string | null;
      k8s_version?: string;
      create_status?: boolean;
      connect_status?: boolean;
      verify_status?: boolean;
      node_config?: Record<string, unknown>;
    }
  ): Promise<{ success: boolean; data?: any; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      
      const { data, error } = await supabase
        .from("clusters")
        .update(updates)
        .eq("cluster_id", cluster_id)
        .select()
        .single();

      if (error) {
        console.error("[Clusters] Update failed:", error.message);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("[Clusters] Update error:", errorMessage);
      return { success: false, error: errorMessage };
    }
  },
};
