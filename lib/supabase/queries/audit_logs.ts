import { createServiceClient } from "../server";
import type { AuditLogEntry } from "@/lib/audit/types";

interface FetchAuditLogsParams {
  page?: number;
  limit?: number;
  user_id?: string;
  service_type?: string;
  action?: string;
  start_date?: string;
  end_date?: string;
}

interface AuditLogsResponse {
  data: AuditLogEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export const AuditLogs = {
  /**
   * Fetch audit logs with filters and pagination (server-side)
   */
  fetchLogs: async (params: FetchAuditLogsParams = {}): Promise<AuditLogsResponse> => {
    try {
      const supabase = await createServiceClient();
      
      const {
        page = 1,
        limit = 20,
        user_id,
        service_type,
        action,
        start_date,
        end_date,
      } = params;

      // Build query
      let query = supabase
        .from("audit_logs")
        .select("*", { count: "exact" });

      // Apply filters
      if (user_id) {
        query = query.eq("user_id", user_id);
      }

      if (service_type) {
        query = query.eq("service_type", service_type);
      }

      if (action) {
        query = query.eq("action", action);
      }

      if (start_date) {
        query = query.gte("created_at", start_date);
      }

      if (end_date) {
        query = query.lte("created_at", end_date);
      }

      // Calculate pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      // Execute query with pagination
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        console.error("Error fetching audit logs:", error);
        throw error;
      }

      const total = count || 0;
      const pages = Math.ceil(total / limit);

      return {
        data: (data as AuditLogEntry[]) || [],
        pagination: {
          page,
          limit,
          total,
          pages,
        },
      };
    } catch (error) {
      console.error("Error in AuditLogs.fetchLogs:", error);
      return {
        data: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          pages: 0,
        },
      };
    }
  },

  /**
   * Fetch single audit log by ID (server-side)
   */
  fetchById: async (logId: string): Promise<AuditLogEntry | null> => {
    try {
      const supabase = await createServiceClient();

      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("id", logId)
        .single();

      if (error) {
        console.error("Error fetching audit log:", error);
        return null;
      }

      return data as AuditLogEntry;
    } catch (error) {
      console.error("Error in AuditLogs.fetchById:", error);
      return null;
    }
  },

  /**
   * Get audit log statistics (server-side)
   */
  getStats: async (): Promise<{
    totalLogs: number;
    todayLogs: number;
    weekLogs: number;
    topUsers: Array<{ user_id: string; count: number }>;
  }> => {
    try {
      const supabase = await createServiceClient();

      // Get total count
      const { count: totalLogs } = await supabase
        .from("audit_logs")
        .select("*", { count: "exact", head: true });

      // Get today's count
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: todayLogs } = await supabase
        .from("audit_logs")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today.toISOString());

      // Get this week's count
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { count: weekLogs } = await supabase
        .from("audit_logs")
        .select("*", { count: "exact", head: true })
        .gte("created_at", weekAgo.toISOString());

      return {
        totalLogs: totalLogs || 0,
        todayLogs: todayLogs || 0,
        weekLogs: weekLogs || 0,
        topUsers: [],
      };
    } catch (error) {
      console.error("Error in AuditLogs.getStats:", error);
      return {
        totalLogs: 0,
        todayLogs: 0,
        weekLogs: 0,
        topUsers: [],
      };
    }
  },
};
