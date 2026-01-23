// ============================================
// AUDIT LOG SERVICE
// Core service for creating and querying audit logs
// ============================================

import { createServiceClient } from "@/lib/supabase/server";
import type {
  CreateAuditLogParams,
  AuditLogEntry,
  AuditLogFilters,
  AuditLogPagination,
} from "./types";
import { sanitizeState } from "./sanitize";
import { computeChanges } from "./diff";

export const AuditLogService = {
  /**
   * Create a new audit log entry
   */
  async create(
    params: CreateAuditLogParams
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const supabase = await createServiceClient();

      // Sanitize state objects (remove passwords, tokens, etc.)
      const sanitizedBefore = params.before_state
        ? sanitizeState(params.before_state)
        : null;
      const sanitizedAfter = params.after_state
        ? sanitizeState(params.after_state)
        : null;

      // Compute changes for updates
      const changes =
        params.action === "update" && sanitizedBefore && sanitizedAfter
          ? computeChanges(sanitizedBefore, sanitizedAfter)
          : null;

      const { data, error } = await supabase
        .from("audit_logs")
        .insert({
          user_id: params.user_id,
          user_role: params.user_role,
          user_email: params.user_email,
          user_username: params.user_username,
          action: params.action,
          service_type: params.service_type,
          service_id: params.service_id,
          service_name: params.service_name,
          before_state: sanitizedBefore,
          after_state: sanitizedAfter,
          changes,
          ip_address: params.ip_address,
          user_agent: params.user_agent,
          request_id: params.request_id,
          metadata: params.metadata,
          created_date: new Date().toISOString().split("T")[0],
        })
        .select("id")
        .single();

      if (error) {
        console.error(`[AuditLogService.create] Error: ${error.message}`);
        return { success: false, error: error.message };
      }

      return { success: true, id: data.id };
    } catch (err) {
      console.error(`[AuditLogService.create] Error: ${err}`);
      return { success: false, error: String(err) };
    }
  },

  /**
   * Query audit logs with filters and pagination
   */
  async query(
    filters: AuditLogFilters,
    pagination: AuditLogPagination
  ): Promise<{ data: AuditLogEntry[]; total: number }> {
    try {
      const supabase = await createServiceClient();
      const { page, limit } = pagination;
      const offset = (page - 1) * limit;

      let query = supabase
        .from("audit_logs")
        .select("*", { count: "exact" });

      // Apply filters
      if (filters.user_id) {
        query = query.eq("user_id", filters.user_id);
      }
      if (filters.service_type) {
        query = query.eq("service_type", filters.service_type);
      }
      if (filters.action) {
        query = query.eq("action", filters.action);
      }
      if (filters.service_id) {
        query = query.eq("service_id", filters.service_id);
      }
      if (filters.date_from) {
        query = query.gte("created_at", filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte("created_at", filters.date_to);
      }
      if (filters.search) {
        query = query.or(
          `service_name.ilike.%${filters.search}%,` +
            `user_email.ilike.%${filters.search}%,` +
            `user_username.ilike.%${filters.search}%`
        );
      }

      // Order and paginate
      query = query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error(`[AuditLogService.query] Error: ${error.message}`);
        return { data: [], total: 0 };
      }

      return { data: (data as AuditLogEntry[]) || [], total: count || 0 };
    } catch (err) {
      console.error(`[AuditLogService.query] Error: ${err}`);
      return { data: [], total: 0 };
    }
  },

  /**
   * Get a single audit log entry by ID
   */
  async getById(id: string): Promise<AuditLogEntry | null> {
    try {
      const supabase = await createServiceClient();

      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error(`[AuditLogService.getById] Error: ${error.message}`);
        return null;
      }

      return data as AuditLogEntry;
    } catch (err) {
      console.error(`[AuditLogService.getById] Error: ${err}`);
      return null;
    }
  },

  /**
   * Verify integrity of an audit log entry
   */
  async verifyIntegrity(
    id: string
  ): Promise<{ valid: boolean; expected?: string; actual?: string }> {
    try {
      const log = await this.getById(id);
      if (!log) return { valid: false };

      // Recompute checksum
      const expectedChecksum = await this.computeChecksum(log);
      const valid = expectedChecksum === log.checksum;

      return {
        valid,
        expected: expectedChecksum,
        actual: log.checksum,
      };
    } catch {
      return { valid: false };
    }
  },

  /**
   * Compute checksum for verification
   */
  async computeChecksum(log: AuditLogEntry): Promise<string> {
    const data = `${log.id}${log.user_id}${log.action}${log.service_type}${log.service_id}${log.created_at}`;
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  },

  /**
   * Get recent audit logs for a user (for user dashboard)
   */
  async getRecentByUser(
    userId: string,
    limit: number = 10
  ): Promise<AuditLogEntry[]> {
    try {
      const supabase = await createServiceClient();

      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        console.error(
          `[AuditLogService.getRecentByUser] Error: ${error.message}`
        );
        return [];
      }

      return (data as AuditLogEntry[]) || [];
    } catch (err) {
      console.error(`[AuditLogService.getRecentByUser] Error: ${err}`);
      return [];
    }
  },

  /**
   * Get audit log statistics
   */
  async getStats(filters?: {
    date_from?: string;
    date_to?: string;
  }): Promise<{
    total: number;
    by_action: Record<string, number>;
    by_service: Record<string, number>;
  }> {
    try {
      const supabase = await createServiceClient();

      let query = supabase.from("audit_logs").select("*");

      if (filters?.date_from) {
        query = query.gte("created_at", filters.date_from);
      }
      if (filters?.date_to) {
        query = query.lte("created_at", filters.date_to);
      }

      const { data, error } = await query;

      if (error) {
        console.error(`[AuditLogService.getStats] Error: ${error.message}`);
        return { total: 0, by_action: {}, by_service: {} };
      }

      const logs = (data as AuditLogEntry[]) || [];

      // Compute stats
      const by_action: Record<string, number> = {};
      const by_service: Record<string, number> = {};

      logs.forEach((log) => {
        by_action[log.action] = (by_action[log.action] || 0) + 1;
        by_service[log.service_type] =
          (by_service[log.service_type] || 0) + 1;
      });

      return {
        total: logs.length,
        by_action,
        by_service,
      };
    } catch (err) {
      console.error(`[AuditLogService.getStats] Error: ${err}`);
      return { total: 0, by_action: {}, by_service: {} };
    }
  },
};
