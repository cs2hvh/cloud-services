// import { Encryption } from "@/config/functions";
// import Error from "next/error";
import { createClient, createSSRClient, createWorkerClient } from "./server";
import { createServiceClient } from "./server";
import { handleQueryError } from "@/lib/utils/error-handler";
import {
  network_rules,
  Tables,
  TablesInsert,
  TablesUpdate,
  EncryptedData,
  Database_Connection,
  DatabaseUser,
  DatabaseInstance,
  Admin_User,
  Admin_Database,
  Admin_Bucket,
  Admin_SpectrumApp,
  ObjectSpaceBucket,
  Admin_KubernetesCluster,
  Promocode,
  Coupon,
} from "./types";
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

interface PromocodeRedemptionEntry {
  userId?: string;
  email?: string;
  redeemedAt?: string;
}

const isPromocodeRedemptionEntry = (value: unknown): value is PromocodeRedemptionEntry => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const hasUserId = typeof record.userId === "string";
  const hasEmail = typeof record.email === "string";
  const redeemedAtValid = record.redeemedAt === undefined || typeof record.redeemedAt === "string";
  return redeemedAtValid && (hasUserId || hasEmail);
};

const getPromocodeRedemptions = (value: Promocode["redeem_by"]): PromocodeRedemptionEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isPromocodeRedemptionEntry);
};


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
        handleQueryError('Get user by ID', error, 'Users');
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError('Get user by ID', err, 'Users');
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
        handleQueryError('Get user profile by email', profileError, 'Users');
        return null;
      }

      return { ...profile, email: user.email || "" };
    } catch (err) {
      handleQueryError('Get user by email', err, 'Users');
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
        handleQueryError('Get all users', error, 'Users');
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError('Get all users', err, 'Users');
      return [];
    }
  },
  get_all_profiles: async (): Promise<Admin_User[]> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("user_profiles")
        .select(`
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
        `)
        .order("created_at", { ascending: false });

      if (error) {
        console.log(
          `[Supabase] Error while getting all users: ${error.message}`,
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
        email: authUsers?.users.find(a => a.id === u.id)?.email || null,
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
        handleQueryError('Get user by discord', error, 'Users');
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError('Get user by discord', err, 'Users');
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
        handleQueryError('Get user by steam', error, 'Users');
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError('Get user by steam', err, 'Users');
      return null;
    }
  },

  update_password: async (userId: string, newPassword: string): Promise<boolean> => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase.auth.admin.updateUserById(
        userId,
        { password: newPassword }
      );

      if (error) {
        handleQueryError('Update user password', error, 'Users');
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError('Update user password', err, 'Users');
      return false;
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
        handleQueryError('Create user profile', error, 'Users');
        return null;
      }
      return data.id;
    } catch (err) {
      handleQueryError('Create user profile', err, 'Users');
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
        handleQueryError('Update user', error, 'Users');
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError('Update user', err, 'Users');
      return false;
    }
  },

  // Delete a user by ID
  delete: async (userId: string): Promise<boolean> => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase.auth.admin.deleteUser(userId);

      if (error) {
        handleQueryError('Delete user', error, 'Users');
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError('Delete user', err, 'Users');
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
        handleQueryError('Count users', error, 'Users');
        return 0;
      }
      return count || 0;
    } catch (err) {
      handleQueryError('Count users', err, 'Users');
      return 0;
    }
  },
};

// Billing helpers (no RPC)
export const Billing = {
  get_balance: async (userId: string): Promise<number> => {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .schema("billing")
      .from("user_credits")
      .select("credit_balance")
      .eq("user_id", userId)
      .single();
    if (error) return 0;
    return (data?.credit_balance as number) ?? 0;
  },

  get_user_credits: async (
    userId: string,
  ): Promise<{ credit_balance: number; promo_credits: number; topup_credits: number }> => {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .schema("billing")
      .from("user_credits")
      .select("credit_balance")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) {
      console.log(error?.message,"error getting balance")
      return { credit_balance: 0, promo_credits: 0, topup_credits: 0 };
    }

    // Calculate promo credits from redeemed coupons
    const { data: promos } = await supabase
      .schema("billing")
      .from("promocodes")
      .select("amount, redeem_by");
    
    const promoCredits = (promos ?? []).reduce((total, promo) => {
      const userRedeemed = getPromocodeRedemptions(promo.redeem_by).some((entry) => entry.userId === userId);
      return userRedeemed ? total + (promo.amount ?? 0) : total;
    }, 0);

    const creditBalance = data.credit_balance ?? 0;
    const topupCredits = Math.max(0, creditBalance - promoCredits);

    console.log(creditBalance,"data.credit_balance", promoCredits, "promo_credits", topupCredits, "topup_credits")
    return {
      credit_balance: creditBalance,
      promo_credits: promoCredits,
      topup_credits: topupCredits,
    };
  },

  topup: async (
    userId: string,
    amount: number,
  ): Promise<{ credit_balance: number; promo_credits?: number; topup_credits?: number }> => {
    const supabase = await createServiceClient();
    const { data: existing } = await supabase
      .schema("billing")
      .from("user_credits")
      .select("credit_balance")
      .eq("user_id", userId)
      .maybeSingle();

    const prevBal = existing?.credit_balance ?? 0;
   // const prevTop = (existing as any)?.topup_credits ?? 0;

    if (!existing) {
      console.log("user has no existing credits, creating new record");
      const { data, error } = await supabase
        .schema("billing")
        .from("user_credits")
        .insert({ user_id: userId, credit_balance: amount})
        .select("credit_balance")
        .single();
      if (error) throw new Error(`Top-up failed: ${error.message}`);
      return {
        credit_balance: data?.credit_balance ?? amount,
        promo_credits: 0,
        topup_credits: 0,
      };
    }

    const next = {
      credit_balance: prevBal + amount,
    } 

    const { data, error } = await supabase
      .schema("billing")
      .from("user_credits")
      .update(next)
      .eq("user_id", userId)
      .select("credit_balance")
      .single();
    if (error) throw new Error(`Top-up failed: ${error.message}`);
    return {
      credit_balance: data ?.credit_balance ?? next.credit_balance,
      promo_credits: 0,
      topup_credits: 0,
    };
  },

  has_balance: async (userId: string, requiredAmount: number): Promise<boolean> => {
    const bal = await Billing.get_balance(userId);
    return bal >= requiredAmount;
  },

  deduct: async (userId: string, amount: number): Promise<number> => {
    console.log(amount,"amount to deduct")
    const supabase = await createServiceClient();
    const bal = await Billing.get_balance(userId);
    if (bal < amount) throw new Error("Insufficient balance");
    const { data, error } = await supabase
      .schema("billing")
      .from("user_credits")
      .update({ credit_balance: bal - amount })
      .eq("user_id", userId)
      .select("credit_balance")
      .single();
    if (error) throw new Error(`Credit deduction failed: ${error.message}`);
    return (data?.credit_balance as number) ?? bal - amount;
  },

  add_active_kubernetes: async (params: { userId: string; serviceId: string; hourlyRate: number }) => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("active_kubernetes")
      .insert({
        user_id: params.userId,
        service_id: params.serviceId,
        hourly_rate: params.hourlyRate,
        status: "active",
        last_billed_at: new Date().toISOString(),
      });
    if (error) throw new Error(`Failed to insert active_kubernetes: ${error.message}`);
  },
  add_active_database: async (params: { userId: string; serviceId: string; hourlyRate: number }) => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("active_database")
      .insert({
        user_id: params.userId,
        service_id: params.serviceId,
        hourly_rate: params.hourlyRate,
        status: "active",
        last_billed_at: new Date().toISOString(),
      });
    if (error) throw new Error(`Failed to insert active_database: ${error.message}`);
  },
  add_active_objectspace: async (params: { userId: string; serviceId: string; hourlyRate: number }) => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("active_objectspace")
      .insert({
        user_id: params.userId,
        service_id: params.serviceId,
        hourly_rate: params.hourlyRate,
        status: "active",
        last_billed_at: new Date().toISOString(),
      });
    if (error) throw new Error(`Failed to insert active_objectspace: ${error.message}`);
  },
  add_active_spectrum: async (params: { userId: string; serviceId: string; hourlyRate: number }) => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("active_spectrum")
      .insert({
        user_id: params.userId,
        service_id: params.serviceId,
        hourly_rate: params.hourlyRate,
        status: "active",
        last_billed_at: new Date().toISOString(),
      });
    if (error) throw new Error(`Failed to insert active_spectrum: ${error.message}`);
  },

  // Internal helper: compute prorated charge for remaining fraction of hour
  _computeProratedCharge: (
    hourlyRate: number | string,
    lastBilledAt?: string | Date,
    now: Date = new Date()
  ): number => {
    const rate = typeof hourlyRate === "number" ? hourlyRate : parseFloat(String(hourlyRate));
    if (!rate || isNaN(rate) || rate <= 0) return 0;

    let last: Date | null = null;
    if (lastBilledAt) {
      if (typeof lastBilledAt === "string") {
        const str = lastBilledAt;
        const hasTZ = str.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(str);
        last = new Date(hasTZ ? str : `${str}Z`);
      } else {
        last = lastBilledAt;
      }
    }

    // Bill for elapsed time since last_billed_at; if no last, bill 1 full hour
    const hoursUsed = last ? Math.max(0, (now.getTime() - last.getTime()) / (1000 * 60 * 60)) : 1;
    const cost = Number((hoursUsed * rate).toFixed(6));
    return cost;
  },

  // Generic closer for active services in billing schema
  close_active_service: async (
    type: "database" | "kubernetes" | "objectspace" | "spectrum",
    params: { userId: string; serviceId: string; failOnInsufficient?: boolean }
  ): Promise<{ charged: number; newBalance: number | null }> => {
    const supabase = await createServiceClient();
    const tableMap: Record<string, string> = {
      database: "active_database",
      kubernetes: "active_kubernetes",
      objectspace: "active_objectspace",
      spectrum: "active_spectrum",
    };
    const table = tableMap[type];
    if (!table) {
      console.error(`[Billing.close_active_service] Unknown service type:`, type);
      throw new Error(`Unknown service type: ${type}`);
    }

    console.log(
      `[Billing.close_active_service] Fetching active row`,
      { type, table, userId: params.userId, serviceId: params.serviceId }
    );
    // Fetch active row
    const { data: row, error: getErr } = await supabase
      .schema("billing")
      .from(table)
      .select("user_id, service_id, hourly_rate, last_billed_at")
      .eq("service_id", params.serviceId)
      //.eq("user_id", params.userId)
      .maybeSingle();

    if (getErr) {
      console.error(
        `[Billing.close_active_service] Supabase fetch error for ${type}:`,
        getErr.message
      );
      throw new Error(`Failed to fetch active ${type}: ${getErr.message}`);
    }

    console.log(`[Billing.close_active_service] Active row`, row);
    if (!row) {
      // Nothing to charge, but still attempt cleanup just in case of stale state
      console.log(
        `[Billing.close_active_service] No active row found; performing cleanup delete`,
        { table, userId: params.userId, serviceId: params.serviceId }
      );
      await supabase
        .schema("billing")
        .from(table)
        .delete()
        .eq("service_id", params.serviceId)
        //.eq("user_id", row?.user_id);
      return { charged: 0, newBalance: null };
    }

    const hourlyRate = (row)?.hourly_rate as number;
    const lastBilledAt = (row)?.last_billed_at as string | undefined;
    const charge = Billing._computeProratedCharge(hourlyRate, lastBilledAt);

    console.log(
      `[Billing.close_active_service] Computed charge`,
      { hourlyRate, lastBilledAt, charge }
    );

    // Deduct credits
    let newBalance: number | null = null;
    if (charge > 0) {
      try {
        newBalance = await Billing.deduct(row.user_id, charge);
        console.log(
          `[Billing.close_active_service] Deduction successful`,
          { userId: params.userId, charge, newBalance }
        );
      } catch (error) {
        if (params.failOnInsufficient) {
          throw new Error("Insufficient balance");
        }
        // If not failing hard, skip deduction and proceed to cleanup
        newBalance = null;
        console.warn(
          `[Billing.close_active_service] Deduction skipped due to error`,
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }

    // Remove active row to stop future accrual
    const { error: delErr } = await supabase
      .schema("billing")
      .from(table)
      .delete()
      .eq("service_id", params.serviceId)
      //.eq("user_id", params.userId);
    if (delErr) {
      console.error(
        `[Billing.close_active_service] Supabase delete error for ${type}:`,
        delErr.message
      );
      throw new Error(`Failed to delete active ${type}: ${delErr.message}`);
    }

    console.log(
      `[Billing.close_active_service] Closed service successfully`,
      { type, charged: charge, newBalance }
    );

    return { charged: charge, newBalance };
  },
};

export const Projects = {
  // Get a project by ID
  get_by_id: async (id: string): Promise<Project | null> => {
    try {
      console.log("Fetching project with ID:", id);
      const supabase = await createServiceClient();
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
        .eq("owner", userId)

      if (error) {
        console.log(
          `[Supabase] Error............. while getting projects by userId: ${error.message}`,
        );
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError('getting projects by userId', err, 'Projects');
      return [];
    }
  },
  // Get all projects where user is involved
  get_all_for_admin: async (): Promise<Project[]> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("projects")
        .select("*")

      if (error) {
        handleQueryError('getting all projects for admin', error, 'Projects');
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError('getting all projects for admin', err, 'Projects');
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
        handleQueryError('creating project', error, 'Projects');
        return null;
      }
      return data.id;
    } catch (err) {
      handleQueryError('creating project', err, 'Projects');
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
        handleQueryError('updating project', error, 'Projects');
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError('updating project', err, 'Projects');
      return false;
    }
  },

  // Delete a project
  delete: async (id: string): Promise<boolean> => {
    try {
      const supabase = await createClient();
      const { error } = await supabase.from("projects").delete().eq("id", id);

      if (error) {
        handleQueryError('deleting project', error, 'Projects');
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError('deleting project', err, 'Projects');
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
        handleQueryError('getting project logs', error, 'Projects');
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError('getting project logs', err, 'Projects');
      return null;
    }
  },

  get_logs_by_user: async (userId: string): Promise<ProjectLog[] | null> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("project_logs")
        .select("* ,projects!inner(*)")
        .eq("projects.owner", userId)
        .order("created_at", { ascending: false });

      if (error) {
        handleQueryError('getting project logs by user', error, 'Projects');
        return [];
      }
      return data;
    } catch (err) {
      handleQueryError('getting project logs by user', err, 'Projects');
      return [];
    }
  },

  add_log: async (props: TablesInsert<"project_logs">,role?:string): Promise<boolean> => {
    try {
      const supabase =role==='admin' ? await createServiceClient() : await createClient();
      const { error } = await supabase.from("project_logs").insert(props);

      if (error) {
        handleQueryError('creating project log', error, 'Projects');
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError('creating project log', err, 'Projects');
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
        handleQueryError('counting projects', error, 'Projects');
        return 0;
      }
      return count || 0;
    } catch (err) {
      handleQueryError('counting projects', err, 'Projects');
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
        handleQueryError('getting game server by id', error, 'GameServers');
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError('getting game server by id', err, 'GameServers');
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
        handleQueryError('getting game servers by user', error, 'GameServers');
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError('getting game servers by user', err, 'GameServers');
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
        handleQueryError('getting game servers by project', error, 'GameServers');
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError('getting game servers by project', err, 'GameServers');
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
        handleQueryError('creating game server', error, 'GameServers');
        return null;
      }
      return data.id;
    } catch (err) {
      handleQueryError('creating game server', err, 'GameServers');
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
        handleQueryError('updating game server', error, 'GameServers');
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError('updating game server', err, 'GameServers');
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
        handleQueryError('deleting game server', error, 'GameServers');
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError('deleting game server', err, 'GameServers');
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
        handleQueryError('getting product by id', error, 'Products');
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError('getting product by id', err, 'Products');
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
        handleQueryError('getting all products', error, 'Products');
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError('getting all products', err, 'Products');
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
        handleQueryError('getting products by type', error, 'Products');
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError('getting products by type', err, 'Products');
      return [];
    }
  },

  get_by_type_and_subtype: async (type: string, subtype: string): Promise<Product[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("type", type)
        .eq("sub", subtype)
        .order("created_at", { ascending: false });

      if (error) {
        handleQueryError('getting products by type and subtype', error, 'Products');
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError('getting products by type and subtype', err, 'Products');
      return [];
    }
  },

  create: async (
    props: TablesInsert<"products">,
  ): Promise<{ success: boolean; data?: Product; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("products")
        .insert(props)
        .select("*")
        .single();

      if (error) {
        handleQueryError('creating product', error, 'Products');
        return { success: false, error: error.message };
      }
      return { success: true, data };
    } catch (err) {
      handleQueryError('creating product', err, 'Products');
      return { success: false, error: String(err) };
    }
  },

  update: async (
    id: string,
    props: TablesUpdate<"products">,
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
        handleQueryError('updating product', error, 'Products');
        return { success: false, error: error.message };
      }
      return { success: true, data };
    } catch (err) {
      handleQueryError('updating product', err, 'Products');
      return { success: false, error: String(err) };
    }
  },

  delete: async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      const { error } = await supabase.from("products").delete().eq("id", id);

      if (error) {
        handleQueryError('deleting product', error, 'Products');
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err) {
      handleQueryError('deleting product', err, 'Products');
      return { success: false, error: String(err) };
    }
  },

  check_usage: async (
    id: string,
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
        handleQueryError('checking product usage', error, 'Products');
        return { inUse: false, count: 0 };
      }

      return { inUse: (count || 0) > 0, count: count || 0 };
    } catch (err) {
      handleQueryError('checking product usage', err, 'Products');
      return { inUse: false, count: 0 };
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
        handleQueryError('getting locations', error, 'Locations');
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError('getting locations', err, 'Locations');
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
        handleQueryError('getting locations by type', error, 'Locations');
        return [];
      }
      return data || [];
    } catch (err) {
      handleQueryError('getting locations by type', err, 'Locations');
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
      handleQueryError('inserting location', error, 'Locations');
      return { success: false, error: error.message };
    }

    return { success: true, data: data };
  },
};

        

export const OTPs = {
  create: async (props: TablesInsert<"otps">): Promise<number | null> => {
    try {
      const supabase = await createSSRClient();
      const { data, error } = await supabase
        .from("otps")
        .insert(props)
        .select("id")
        .single();

      if (error) {
        handleQueryError('creating OTP', error, 'OTPs');
        return null;
      }
      return data.id;
    } catch (err) {
      handleQueryError('creating OTP', err, 'OTPs');
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
        handleQueryError('getting OTP by email', error, 'OTPs');
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError('getting OTP by email', err, 'OTPs');
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
        handleQueryError('verifying OTP', error, 'OTPs');
        return false;
      }
      return true;
    } catch (err) {
      handleQueryError('verifying OTP', err, 'OTPs');
      return false;
    }
  },

  verify_otp: async (email: string, otp_code: string): Promise<{ id: number; verified: boolean; expires_at: string } | null> => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("otps")
        .select("id, verified, expires_at")
        .eq("email", email)
        .eq("otp_code", otp_code)
        .eq("verified", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        handleQueryError('verifying OTP code', error || new Error('No data found'), 'OTPs');
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError('verifying OTP code', err, 'OTPs');
      return null;
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
      handleQueryError('getting project by id - invalid project ID', new Error('Invalid project ID'), 'Clusters');
      return [];
    }


     const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      handleQueryError('getting project by id - invalid UUID format', new Error('Invalid UUID format'), 'Clusters');
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
        handleQueryError('getting clusters by project id', error, 'Clusters');
        return [];
      }
      return data;
    } catch (err) {
      handleQueryError('getting clusters by project id', err, 'Clusters');
      return [];
    }
  },



   get_by_user_id: async (userId: string): Promise<ClustersGet[]>=> {
    try {
      //console.log(projectId,"..................933..id");


       if (!userId || typeof userId !== 'string') {
      handleQueryError('getting clusters by user id - invalid user ID', new Error('Invalid user ID'), 'Clusters');
      return [];
    }


     const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      handleQueryError('getting clusters by user id - invalid UUID format', new Error('Invalid UUID format'), 'Clusters');
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
        handleQueryError('getting clusters by user id', error, 'Clusters');
        return [];
      }
      return data;
    } catch (err) {
      handleQueryError('getting clusters by user id', err, 'Clusters');
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
        handleQueryError('getting cluster by id', error, 'Clusters');
        return null;
      }
      return data;
    } catch (err) {
      handleQueryError('getting cluster by id', err, 'Clusters');
      return null;
    }
  },

  get_all_for_admin: async (): Promise<Admin_KubernetesCluster[]> => {
    try {
      const supabase = await createServiceClient();
      
      // Get all clusters
      const { data: clusters, error } = await supabase
        .from("clusters")
        .select(`
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
        `)
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
      const uniqueOwnerIds = [...new Set(clusters.map(c => c.owner_id).filter(Boolean))];
      
      // Batch fetch only the needed user emails
      const emailMap = new Map<string, string>();
      if (uniqueOwnerIds.length > 0) {
        const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
        
        if (!authError && authUsers?.users) {
          authUsers.users
            .filter(u => uniqueOwnerIds.includes(u.id))
            .forEach(u => {
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
};



export const Database_Clusters = {
 
  create:async(payload:Database )=>{
  


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

  update_status: async(cluster_id:string, status:string, caCertificate:string | EncryptedData|null|undefined, public_connection:Database_Connection, private_connection:Database_Connection)=>{


   // console.log(caCertificate, "...........in updateDatabaseClusterWorker........");
  const supabase = await createWorkerClient();
   const { data, error } = await supabase
     .from("database_cluster")
     .update({ status, ca_certificate: caCertificate, public_connection, private_connection })
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
     .eq("owner_id", owner_id)
     .neq("status", "deleted");

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
     .eq("owner_id", owner_id)
     .neq("status", "deleted");

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

 mark_as_deleted: async(cluster_id:string)=>{
   // console.log(cluster_id, "...........in mark_as_deleted........");
   const supabase = await createWorkerClient();
   const { data, error } = await supabase
     .from("database_cluster")
     .update({ status: 'deleted' })
     .eq("cluster_id", cluster_id)
     .select();
    if (error) {
      console.error("[mark_as_deleted] update failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, cluster: data };
 },

  update_network_rules: async(cluster_id:string, network_rules:network_rules)=>{


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
  add_user: async(cluster_id: string, user: DatabaseUser) => {
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

  remove_user: async(cluster_id: string, username: string) => {
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
    const updatedUsers = currentUsers.filter((u: DatabaseUser) => u.name !== username);

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

  update_users: async(cluster_id: string, users: DatabaseUser[]) => {
   // console.log(users, "...........in updateDatabaseUsers........");
    const supabase = await createWorkerClient();
    
    const { data, error } = await supabase
      .from("database_cluster")
      .update({ users })
      .eq("cluster_id", cluster_id)
      .select("*")
      .single();

    if (error) {
     // console.error("[updateDatabaseUsers] update failed:", error.message);
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
  add_db: async(cluster_id: string, database: DatabaseInstance) => {
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

  remove_db: async(cluster_id: string, db_name: string) => {
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
    const updatedDbs = currentDbs.filter((db: DatabaseInstance) => db.name !== db_name);

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

  update_dbs: async(cluster_id: string, databases: DatabaseInstance[]) => {
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
  update_region: async(cluster_id: string, region: string, status: string = "migrating") => {
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
  update_maintenance_window: async(cluster_id: string, window: { day: string, hour: string }) => {
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
  update_storage: async(cluster_id: string, size: string) => {
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

  // Get all databases for admin panel
  get_all_for_admin: async (): Promise<Admin_Database[]> => {
    try {
      const supabase = await createServiceClient();
      
      // Get all database clusters with user profile data
      const { data: clusters, error } = await supabase
        .from("database_cluster")
        .select(`
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
        `)
        .neq("status", "deleted")
        .order("created_at", { ascending: false });

      if (error) {
        console.log(`[Database_Clusters] Error while getting all databases: ${error.message}`);
        return [];
      }

      if (!clusters || clusters.length === 0) return [];

      // Get unique owner IDs to minimize auth queries
      const uniqueOwnerIds = [...new Set(clusters.map(c => c.owner_id).filter(Boolean))];
      
      // Batch fetch only the needed user emails
      const emailMap = new Map<string, string>();
      if (uniqueOwnerIds.length > 0) {
        const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
        
        if (!authError && authUsers?.users) {
          authUsers.users
            .filter(u => uniqueOwnerIds.includes(u.id))
            .forEach(u => {
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
            owner_username: (userProfile)?.username ?? null,
            created_at: cluster.created_at ?? null,
            project_id: cluster.project_id ?? "",
          } as Admin_Database;
        })
        .filter((item): item is Admin_Database => Boolean(item));

      return merged;
    } catch (err) {
      console.log(`[Database_Clusters] Error while getting all databases: ${err}`);
      return [];
    }
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
        error: String(err),
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

// Spectrum Apps query helpers
type SpectrumAppRow = Tables<"spectrum_apps">;

export const Spectrum_Apps = {
  create: async (payload: TablesInsert<"spectrum_apps">) => {
    try {
      const supabase = await createWorkerClient();
      const { data, error } = await supabase
        .from("spectrum_apps")
        .insert(payload)
        .select()
        .single();
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  update: async (spectrum_id: string, patch: TablesUpdate<"spectrum_apps">) => {
    try {

      console.log('reached update spectrum app', spectrum_id, patch);
      const supabase = await createWorkerClient();
      const { data, error } = await supabase
        .from("spectrum_apps")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("spectrum_id", spectrum_id)
        .select()
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  get: async (spectrum_id: string) => {
    try {
      const supabase = await createServiceClient();
      const { data, error } = await supabase
        .from("spectrum_apps")
        .select("*")
        .eq("spectrum_id", spectrum_id)
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
  list_by_owner: async (owner_id: string): Promise<SpectrumAppRow[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("spectrum_apps")
        .select("*")
        .eq("owner_id", owner_id)
        .neq("status", "deleted")
        .order("created_at", { ascending: false });
      if (error) return [];
      return data || [];
    } catch {
      return [];
    }
  },
  delete: async (spectrum_id: string) => {
    try {
      const supabase = await createWorkerClient();
      const { data, error } = await supabase
        .from("spectrum_apps")
        .delete()
        .eq("id", spectrum_id)
        .select();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },

  mark_as_deleted: async (spectrum_id: string) => {
    console.log('reached mark as delete')
    try {
      const supabase = await createWorkerClient();
      const { data, error } = await supabase
        .from("spectrum_apps")
        .update({ status: 'deleted' })
        .eq("spectrum_id", spectrum_id)
        .select();
      if (error) return { success: false, error: error.message };
      return { success: true, data };
    } catch (err) {
      console.log('error in mark as delete', err)
      return { success: false, error: String(err) };
    }
  },

  // Admin methods
  get_all_for_admin: async (): Promise<Admin_SpectrumApp[]> => {
    try {
      const supabase = await createServiceClient();
      
      // Get all spectrum apps
      const { data: apps, error } = await supabase
        .from("spectrum_apps")
        .select(`
          id,
          spectrum_id,
          protocol,
          origin_direct,
          status,
          tls,
          traffic_type,
          ip_firewall,
          proxy_protocol,
          edge_ips,
          created_at,
          project_id,
          owner_id,
          dns,
          user_profiles(username)
        `)
        .neq("status", "deleted")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(
          `[Spectrum_Apps] Error getting all apps for admin: ${error.message}`
        );
        return [];
      }

      if (!apps || apps.length === 0) return [];

      // Get unique owner IDs to minimize auth queries
      const uniqueOwnerIds = [...new Set(apps.map(a => a.owner_id).filter(Boolean))];
      
      // Batch fetch only the needed user emails
      const emailMap = new Map<string, string>();
      if (uniqueOwnerIds.length > 0) {
        const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
        
        if (!authError && authUsers?.users) {
          authUsers.users
            .filter(u => uniqueOwnerIds.includes(u.id))
            .forEach(u => {
              if (u.id && u.email) emailMap.set(u.id, u.email);
            });
        }
      }

      // Map and merge data with proper typing
      const merged: Admin_SpectrumApp[] = apps
        .map((app) => {
          // Safely access nested user_profiles
          const userProfile = Array.isArray(app.user_profiles)
            ? app.user_profiles[0]
            : app.user_profiles;

          return {
            id: app.id ?? "",
            spectrum_id: app.spectrum_id ?? "",
            protocol: app.protocol ?? "",
            origin_direct: app.origin_direct ?? [],
            status: app.status ?? null,
            tls: app.tls ?? "off",
            traffic_type: app.traffic_type ?? "direct",
            ip_firewall: app.ip_firewall ?? false,
            proxy_protocol: app.proxy_protocol ?? "off",
            owner_id: app.owner_id ?? "",
            owner_email: emailMap.get(app.owner_id ?? "") ?? null,
            owner_username: userProfile?.username ?? null,
            created_at: app.created_at ?? null,
            project_id: app.project_id ?? null,
            edge_ips: app.edge_ips ?? null,
            dns: app.dns ?? null,
          };
        })
        .filter((app) => app.id !== ""); // Filter out invalid entries

      return merged;
    } catch (err) {
      console.error(`[Spectrum_Apps] Error in get_all_for_admin: ${err}`);
      return [];
    }
  },

  //get all app name for unique name check
   get_all_app_name: async (role:string) => {
    try {
      const supabase = await (role==='admin'? createSSRClient():createWorkerClient());
      const { data, error } = await supabase
        .from("spectrum_apps")
        .select("dns->>original_name")
        .neq("status", "deleted")
        .order("created_at", { ascending: false });


       // console.log(data, ".........check..data in get_all_app_name........");

        const names = data?.map(row => row.original_name);


       // console.log(names, "...........data in get_all_app_name........");
      if (error) return [];
      return names || [];
    } catch {
      return [];
    }
  },

  get_by_project_id: async (projectId: string): Promise<SpectrumAppRow[]> => {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("spectrum_apps")
        .select("*")
        .eq("project_id", projectId)
        .neq("status", "deleted")
        .order("created_at", { ascending: false });
      if (error) {
        console.error(`[Spectrum_Apps.get_by_project_id] Error: ${error.message}`);
        return [];
      }
      return data || [];
    } catch (err) {
      console.error(`[Spectrum_Apps.get_by_project_id] Error: ${err}`);
      return [];
    }
  },
};




//All storage of files in s3 bucket and recieve the url to store in database

export const storeFile=async(clusterId:string, file:File)=>{

  const path = `clusters/${clusterId}/${Date.now()}-${file.name}`;
  const supabase = await createSSRClient();
  const { error: uploadError } = await supabase
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

  mark_as_deleted: async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      console.log(id, "...........id in mark_as_deleted object space........");
      const supabase = await createWorkerClient();
      const { error } = await supabase
        .from("object_spaces")
        .update({ status: 'deleted' })
        .eq("id", id);

      if (error) {
        console.error(`[ObjectSpaces] Error marking as deleted: ${error.message}`);
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
        .insert({
          ...payload,
          type: "bucket",
        })
        .select()
        .single();

      if (error) {
        console.error(`[ObjectSpaces] Error creating bucket: ${error.message}`);
        return { success: false, error: error.message };
      }
      return { success: true, data: data as ObjectSpaceBucket };
    } catch (err) {
      console.error(`[ObjectSpaces] Error creating bucket: ${err}`);
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

  get_by_project_id: async (projectId: string): Promise<ObjectSpaceBucket[]> => {
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
        console.error(`[ObjectSpaces.get_by_project_id] Error: ${error.message}`);
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
      const supabase = is_admin ? await createWorkerClient() : await createSSRClient();
      const { data, error } = await supabase
        .from("object_spaces")
        .select("*")
        .eq("id", id)
        .eq("type", "bucket")
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
        .select(`
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
        `)
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
      const uniqueOwnerIds = [...new Set(buckets.map(b => b.owner_id).filter(Boolean))];
      
      // Batch fetch only the needed user emails
      const emailMap = new Map<string, string>();
      if (uniqueOwnerIds.length > 0) {
        const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
        
        if (!authError && authUsers?.users) {
          authUsers.users
            .filter(u => uniqueOwnerIds.includes(u.id))
            .forEach(u => {
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

export const Promocodes = {
  // Admin: Create new promocode
  create: async (data: {
    code: string;
    amount: number;
    valid_till: string;
    coupon_type: string;
    max_redemptions?: number;
    created_by: string;
  }): Promise<{ success: boolean; data?: Promocode; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      
      // Check if code already exists
      const { data: existing } = await supabase
        .schema("billing")
        .from("promocodes")
        .select("code")
        .eq("code", data.code)
        .maybeSingle();

      if (existing) {
        return { success: false, error: "Promo code already exists" };
      }

      const { data: newPromo, error } = await supabase
        .schema("billing")
        .from("promocodes")
        .insert({
          code: data.code,
          amount: data.amount,
          valid_till: data.valid_till,
          coupon_type: data.coupon_type,
          max_redemptions: data.max_redemptions || null,
          created_by: data.created_by,
          redeem_by: [],
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        handleQueryError('Create promocode', error, 'Promocodes');
        return { success: false, error: error.message };
      }

      return { success: true, data: newPromo };
    } catch (err) {
      handleQueryError('Create promocode', err, 'Promocodes');
      return { success: false, error: 'Failed to create promocode' };
    }
  },

  // Admin: Update promocode
  update: async (id: string, data: {
    amount?: number;
    valid_till?: string;
    coupon_type?: string;
    max_redemptions?: number;
    is_active?: boolean;
  }): Promise<{ success: boolean; data?: Promocode; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      
      const { data: updated, error } = await supabase
        .schema("billing")
        .from("promocodes")
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        handleQueryError('Update promocode', error, 'Promocodes');
        return { success: false, error: error.message };
      }

      return { success: true, data: updated };
    } catch (err) {
      handleQueryError('Update promocode', err, 'Promocodes');
      return { success: false, error: 'Failed to update promocode' };
    }
  },

  // Admin: Delete promocode (hard delete from database)
  delete: async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = await createServiceClient();
      
      const { error } = await supabase
        .schema("billing")
        .from("promocodes")
        .delete()
        .eq("id", id);

      if (error) {
        handleQueryError('Delete promocode', error, 'Promocodes');
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      handleQueryError('Delete promocode', err, 'Promocodes');
      return { success: false, error: 'Failed to delete promocode' };
    }
  },

  // Admin: Get all promocodes
  get_all: async (): Promise<Coupon[]> => {
    try {
      const supabase = await createServiceClient();
      
      const { data, error } = await supabase
        .schema("billing")
        .from("promocodes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        handleQueryError('Get all promocodes', error, 'Promocodes');
        return [];
      }

      // Calculate redemption count for each coupon
      return (data || []).map((promo) => {
        const redeemBy = getPromocodeRedemptions(promo.redeem_by);
        return {
          ...promo,
          redemption_count: redeemBy.length,
        };
      });
    } catch (err) {
      handleQueryError('Get all promocodes', err, 'Promocodes');
      return [];
    }
  },

  // Get promocode by ID
  get_by_id: async (id: string): Promise<Promocode | null> => {
    try {
      const supabase = await createServiceClient();
      
      const { data, error } = await supabase
        .schema("billing")
        .from("promocodes")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        handleQueryError('Get promocode by ID', error, 'Promocodes');
        return null;
      }

      return data;
    } catch (err) {
      handleQueryError('Get promocode by ID', err, 'Promocodes');
      return null;
    }
  },

  // Get promocode by code
  get_by_code: async (code: string): Promise<Promocode | null> => {
    try {
      const supabase = await createServiceClient();
      
      const { data, error } = await supabase
        .schema("billing")
        .from("promocodes")
        .select("*")
        .eq("code", code)
        .eq("is_active", true)
        .single();

      if (error) {
        handleQueryError('Get promocode by code', error, 'Promocodes');
        return null;
      }

      return data;
    } catch (err) {
      handleQueryError('Get promocode by code', err, 'Promocodes');
      return null;
    }
  },

  // User: Get available promocodes (not yet redeemed by user)
  get_available_for_user: async (userId: string, email: string): Promise<Promocode[]> => {
    try {
      const supabase = await createServiceClient();
      
      const { data, error } = await supabase
        .schema("billing")
        .from("promocodes")
        .select("*")
        .eq("is_active", true)
        .gte("valid_till", new Date().toISOString());

      if (error) {
        handleQueryError('Get available promocodes for user', error, 'Promocodes');
        return [];
      }

      // Filter out coupons already redeemed by this user
      const available = (data || []).filter((promo) => {
        const redeemBy = getPromocodeRedemptions(promo.redeem_by);
        const hasRedeemed = redeemBy.some((entry) => entry.userId === userId || entry.email === email);
        
        // Check max redemptions limit if set
        if (promo.max_redemptions && redeemBy.length >= promo.max_redemptions) {
          return false;
        }
        
        return !hasRedeemed;
      });

      return available;
    } catch (err) {
      handleQueryError('Get available promocodes for user', err, 'Promocodes');
      return [];
    }
  },

  // Validate coupon code
  validate_code: async (code: string, userId: string, email: string): Promise<{ 
    valid: boolean; 
    error?: string; 
    data?: Promocode;
  }> => {
    try {
      const supabase = await createServiceClient();
      
      const { data: promo, error } = await supabase
        .schema("billing")
        .from("promocodes")
        .select("*")
        .eq("code", code)
        .eq("is_active", true)
        .single();

      if (error || !promo) {
        return { valid: false, error: "Invalid or inactive promo code" };
      }

      // Check expiration
      if (new Date(promo.valid_till) < new Date()) {
        return { valid: false, error: "Promo code has expired" };
      }

      // Check if user already redeemed
      const redeemBy = getPromocodeRedemptions(promo.redeem_by);
      const alreadyRedeemed = redeemBy.some((entry) => entry.userId === userId || entry.email === email);

      if (alreadyRedeemed) {
        return { valid: false, error: "You have already redeemed this promo code" };
      }

      // Check max redemptions
      if (promo.max_redemptions && redeemBy.length >= promo.max_redemptions) {
        return { valid: false, error: "Promo code redemption limit reached" };
      }

      return { valid: true, data: promo };
    } catch (err) {
      handleQueryError('Validate promocode', err, 'Promocodes');
      return { valid: false, error: 'Failed to validate promo code' };
    }
  },

  // User: Redeem promocode
  redeem: async (code: string, userId: string, email: string): Promise<{ 
    success: boolean; 
    balance?: number; 
    amount?: number;
    error?: string;
  }> => {
    try {
      const supabase = await createServiceClient();
      
      // Validate the code first
      const validation = await Promocodes.validate_code(code, userId, email);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const promo = validation.data;
      if (!promo) {
        return { success: false, error: "Promo code not found" };
      }

      // Update redeem_by array
      const redeemBy = [
        ...getPromocodeRedemptions(promo.redeem_by),
        { userId, email, redeemedAt: new Date().toISOString() },
      ];

      // Check if we need to deactivate the coupon (for limited type)
      const shouldDeactivate = 
        promo.coupon_type === 'limited' && 
        promo.max_redemptions && 
        redeemBy.length >= promo.max_redemptions;

      // Update promocode
      const { error: updateError } = await supabase
        .schema("billing")
        .from("promocodes")
        .update({ 
          redeem_by: redeemBy as Promocode["redeem_by"],
          updated_at: new Date().toISOString(),
          ...(shouldDeactivate && { is_active: false }),
        })
        .eq("id", promo.id);

      if (updateError) {
        handleQueryError('Update promocode redeem_by', updateError, 'Promocodes');
        return { success: false, error: "Failed to redeem promo code" };
      }

      // Add amount to user balance
      const topupResult = await Billing.topup(userId, promo.amount);

      return { 
        success: true, 
        balance: topupResult.credit_balance,
        amount: promo.amount,
      };
    } catch (err) {
      handleQueryError('Redeem promocode', err, 'Promocodes');
      return { success: false, error: 'Failed to redeem promo code' };
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
  // vms:Vms,
  clusters:Clusters,
  database_clusters:Database_Clusters,
  activities: Activities,
  object_spaces: ObjectSpaces,
};

export default api;
