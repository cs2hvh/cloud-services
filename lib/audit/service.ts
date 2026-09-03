// ============================================
// AUDIT LOG SERVICE
// Core service for creating and querying audit logs
// ============================================

import { createServiceClient } from "@/lib/supabase/server";
import { selectAll } from "@/lib/supabase/select-all";
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
        .schema('audits')
        .from('audit_logs')
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
        .schema('audits')
        .from('audit_logs')
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

      // Prevents: an unreachable audits schema rendering as "no activity" —
      // that exact failure hid an unexposed schema for 8 days.
      if (error) {
        throw new Error(`[AuditLogService.query] audit log read failed: ${error.message}`);
      }
      if (count === null) {
        throw new Error("[AuditLogService.query] audit log count missing from response");
      }

      return { data: (data as AuditLogEntry[]) || [], total: count };
    } catch (err) {
      console.error(`[AuditLogService.query] Error: ${err}`);
      throw err;
    }
  },

  /**
   * Get a single audit log entry by ID
   */
  async getById(id: string): Promise<AuditLogEntry | null> {
    try {
      const supabase = await createServiceClient();

      const { data, error } = await supabase
        .schema('audits')
        .from('audit_logs')
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
        .schema('audits')
        .from('audit_logs')
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      // Prevents: a failed read rendering the user's activity feed as empty.
      if (error) {
        throw new Error(
          `[AuditLogService.getRecentByUser] audit log read failed: ${error.message}`
        );
      }

      return (data as AuditLogEntry[]) || [];
    } catch (err) {
      console.error(`[AuditLogService.getRecentByUser] Error: ${err}`);
      throw err;
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

      // Applied to both reads below so the count and the breakdown describe
      // the same window.
      const scoped = <
        Q extends {
          gte: (column: string, value: string) => Q;
          lte: (column: string, value: string) => Q;
        },
      >(
        query: Q
      ): Q => {
        let q = query;
        if (filters?.date_from) q = q.gte("created_at", filters.date_from);
        if (filters?.date_to) q = q.lte("created_at", filters.date_to);
        return q;
      };

      // `total` is the server's exact count, not the length of whatever came
      // back: PostgREST caps a response at 1000 rows, so the old
      // `logs.length` reported every busy window as exactly 1000.
      const { count, error: countError } = await scoped(
        supabase.schema('audits').from('audit_logs').select("*", { count: "exact", head: true })
      );
      if (countError) {
        throw new Error(`[AuditLogService.getStats] audit log count failed: ${countError.message}`);
      }
      if (count === null) {
        throw new Error("[AuditLogService.getStats] audit log count missing from response");
      }

      // Paged read of just the two grouped columns. Throws on a failed page
      // rather than reporting an unreachable table as zero activity.
      const logs = await selectAll<Pick<AuditLogEntry, "action" | "service_type">>(
        (from, to) =>
          scoped(supabase.schema('audits').from('audit_logs').select("action, service_type"))
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to),
        { label: "audits.audit_logs" }
      );

      // Compute stats
      const by_action: Record<string, number> = {};
      const by_service: Record<string, number> = {};

      logs.forEach((log) => {
        by_action[log.action] = (by_action[log.action] || 0) + 1;
        by_service[log.service_type] =
          (by_service[log.service_type] || 0) + 1;
      });

      return {
        total: count,
        by_action,
        by_service,
      };
    } catch (err) {
      console.error(`[AuditLogService.getStats] Error: ${err}`);
      throw err;
    }
  },
};
