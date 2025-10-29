// import { Encryption } from "@/config/functions";
import { createClient, createSSRClient, createWorkerClient } from "./server";
import { createServiceClient } from "./server";
import { network_rules, Tables, TablesInsert, TablesUpdate, EncryptedData, Database_Connection } from "./types";
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
      console.log(cluster_id,"..................933..id");
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
};



export const Database_Clusters = {
 
  create:async(payload:Database )=>{
  


    console.log(payload, "...........in createDatabaseClusterWorker........");
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

  console.log(data, "...........in createDatabaseClusterWorker........");

  return { success: true, data: data };
  },

  update_status: async(cluster_id:string, status:string, caCertificate:string | EncryptedData|null, public_connection:Database_Connection, private_connection:Database_Connection)=>{


    console.log(caCertificate, "...........in updateDatabaseClusterWorker........");
  const supabase = await createWorkerClient();
   const { data, error } = await supabase
     .from("database_cluster")
     .update({ status, ca_certificate: caCertificate, public_connection, private_connection })
     .eq("cluster_id", cluster_id)
     .select("*")
     .single();
     console.log(data, "...........in updateDatabaseClusterWorker........");

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
    console.log(cluster_id, "...........in deleteDatabaseClusterWorker........");
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

  update_network_rules: async(cluster_id:string, network_rules:network_rules)=>{


    console.log(network_rules, "...........in updateDatabaseClusterWorker........");
  const supabase = await createWorkerClient();
   const { data, error } = await supabase
     .from("database_cluster")
     .update({ network_rules })
     .eq("cluster_id", cluster_id)
     .select("*")
     .single();
     console.log(data, "...........in updateDatabaseClusterWorker........");

   if (error) {
     console.error("[updateClusterWorker] update failed:", error.message);
     return { success: false, error: error.message };
   }
   return { success: true, data: data };
},

  // Database user management functions
  add_user: async(cluster_id: string, user: any) => {
    console.log(user, "...........in addDatabaseUser........");
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
    console.log(username, "...........in removeDatabaseUser........");
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
    const updatedUsers = currentUsers.filter((u: any) => u.name !== username);

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

  update_users: async(cluster_id: string, users: any[]) => {
    console.log(users, "...........in updateDatabaseUsers........");
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
  add_db: async(cluster_id: string, database: any) => {
    console.log(database, "...........in addDatabase........");
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
    console.log(db_name, "...........in removeDatabase........");
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
    const updatedDbs = currentDbs.filter((db: any) => db.name !== db_name);

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

  update_dbs: async(cluster_id: string, databases: any[]) => {
    console.log(databases, "...........in updateDatabases........");
    const supabase = await createWorkerClient();
    
    const { data, error } = await supabase
      .from("database_cluster")
      .update({ dbs: databases })
      .eq("cluster_id", cluster_id)
      .select("*")
      .single();

    if (error) {
      console.error("[updateDatabases] update failed:", error.message);
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
    console.log(`[updateProject] cluster_id: ${cluster_id}, project_id: ${project_id}`);
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
    console.log(`[updateRegion] cluster_id: ${cluster_id}, region: ${region}, status: ${status}`);
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
    console.log(`[updateMaintenanceWindow] cluster_id: ${cluster_id}, window:`, window);
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
        console.log(
          `[Supabase] Error while getting project by id: ${error.message}`,
        );
        return [];
      }
      console.log(data, "...........data in database cluster by project id........");
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
        error: err instanceof Error ? err.message : "Unknown error",
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




//All storage of files in s3 bucket and recieve the url to store in database

export const storeFile=async(clusterId:string, file:File)=>{

  const path = `clusters/${clusterId}/${Date.now()}-${file.name}`;
  const supabase = await createSSRClient();
  const { data, error: uploadError } = await supabase
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
};

export default api;
