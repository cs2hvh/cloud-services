import { createServiceClient } from "@/lib/supabase/server";
import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";
import type { DomainTransferRequestRepositoryPort } from "@/lib/domain-service/core/ports";
import type { DomainTransferRequest, DomainTransferRequestStatus } from "@/lib/domain-service/core/types";

const TABLE = "domain_transfer_requests";

export class SupabaseDomainTransferRequestRepository implements DomainTransferRequestRepositoryPort {
  async create(params: {
    userId: string;
    domain: string;
    authCodeHash?: string | null;
    purchasePrice?: number | null;
    renewalPrice?: number | null;
    currency?: string;
    provider?: string;
    providerOrderId?: string | null;
    providerStatus?: string | null;
    providerEmail?: string | null;
    idempotencyKey?: string | null;
    metadata?: Record<string, unknown>;
    status?: DomainTransferRequestStatus;
  }): Promise<DomainTransferRequest> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        user_id: params.userId,
        domain: params.domain,
        status: params.status || "initiated",
        auth_code_hash: params.authCodeHash ?? null,
        purchase_price: params.purchasePrice ?? null,
        renewal_price: params.renewalPrice ?? null,
        currency: params.currency || "USD",
        provider: params.provider || "namecom",
        provider_order_id: params.providerOrderId || null,
        provider_status: params.providerStatus || null,
        provider_email: params.providerEmail || null,
        idempotency_key: params.idempotencyKey || null,
        metadata: params.metadata || {},
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        if (params.idempotencyKey) {
          const existing = await this.findByIdempotencyKey(params.userId, params.idempotencyKey);
          if (existing) return existing;
        }
        const active = await this.findActiveByDomain(params.domain);
        if (active) {
          throw new DomainServiceError({
            code: DOMAIN_ERROR_CODES.TRANSFER_ALREADY_IN_PROGRESS,
            message: `A transfer is already in progress for ${params.domain}`,
            details: { domain: params.domain, existingTransferId: active.id },
          });
        }
      }

      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to create domain transfer request: ${error.message}`,
      });
    }

    return data as DomainTransferRequest;
  }

  async findByIdForUser(requestId: string, userId: string): Promise<DomainTransferRequest | null> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", requestId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to read domain transfer request: ${error.message}`,
      });
    }

    return (data || null) as DomainTransferRequest | null;
  }

  async findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<DomainTransferRequest | null> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .eq("idempotency_key", idempotencyKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to read transfer idempotency state: ${error.message}`,
      });
    }

    return (data || null) as DomainTransferRequest | null;
  }

  async findActiveByDomain(domain: string): Promise<DomainTransferRequest | null> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("domain", domain)
      .in("status", ["initiated", "pending", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to check active transfer: ${error.message}`,
      });
    }

    return (data || null) as DomainTransferRequest | null;
  }

  async listByUser(params: {
    userId: string;
    limit?: number;
    includeArchived?: boolean;
  }): Promise<DomainTransferRequest[]> {
    const supabase = await createServiceClient();
    const requestedLimit = params.limit || 20;
    const queryLimit = params.includeArchived ? requestedLimit : Math.min(requestedLimit * 4, 200);
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", params.userId)
      .order("created_at", { ascending: false })
      .limit(queryLimit);

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to list domain transfer requests: ${error.message}`,
      });
    }

    const rows = (data || []) as DomainTransferRequest[];
    if (params.includeArchived) return rows;

    return rows
      .filter((row) => !isArchived(row.metadata))
      .slice(0, requestedLimit);
  }

  async listPendingForPolling(params: {
    limit?: number;
    staleBefore?: string;
  }): Promise<DomainTransferRequest[]> {
    const supabase = await createServiceClient();
    let query = supabase
      .from(TABLE)
      .select("*")
      .in("status", ["initiated", "pending", "approved"])
      .order("last_polled_at", { ascending: true, nullsFirst: true })
      .limit(params.limit || 50);

    if (params.staleBefore) {
      query = query.or(`last_polled_at.is.null,last_polled_at.lt.${params.staleBefore}`);
    }

    const { data, error } = await query;

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to list transfers for polling: ${error.message}`,
      });
    }

    return (data || []) as DomainTransferRequest[];
  }

  async updateStatus(params: {
    requestId: string;
    status: DomainTransferRequestStatus;
    providerOrderId?: string | null;
    providerStatus?: string | null;
    providerEmail?: string | null;
    lastError?: string | null;
    failureReason?: string | null;
    renewalPrice?: number | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const supabase = await createServiceClient();
    const update: Record<string, unknown> = {
      status: params.status,
    };

    if (params.providerOrderId !== undefined) update.provider_order_id = params.providerOrderId;
    if (params.providerStatus !== undefined) update.provider_status = params.providerStatus;
    if (params.providerEmail !== undefined) update.provider_email = params.providerEmail;
    if (params.lastError !== undefined) update.last_error = params.lastError;
    if (params.failureReason !== undefined) update.failure_reason = params.failureReason;
    if (params.renewalPrice !== undefined) update.renewal_price = params.renewalPrice;
    if (params.metadata !== undefined) {
      const { data: existing } = await supabase
        .from(TABLE)
        .select("metadata")
        .eq("id", params.requestId)
        .maybeSingle();
      update.metadata = { ...(existing?.metadata ?? {}), ...params.metadata };
    }

    const { error } = await supabase
      .from(TABLE)
      .update(update)
      .eq("id", params.requestId);

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to update transfer status: ${error.message}`,
      });
    }
  }

  async updatePolled(requestId: string): Promise<void> {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .from(TABLE)
      .update({
        last_polled_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to update poll timestamp: ${error.message}`,
      });
    }

    // Increment poll_count atomically
    const { error: rpcError } = await supabase.rpc("increment_transfer_poll_count" as never, {
      transfer_id: requestId,
    } as never);

    // Non-critical — if the RPC doesn't exist yet, just skip
    if (rpcError && !rpcError.message.includes("does not exist")) {
      console.warn("[DomainTransferRepository] poll_count increment failed:", rpcError.message);
    }
  }

  async clearAuthCode(requestId: string): Promise<void> {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .from(TABLE)
      .update({ auth_code_hash: null })
      .eq("id", requestId);

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to clear auth code: ${error.message}`,
      });
    }
  }

  async archive(requestId: string, archivedBy: string): Promise<void> {
    const supabase = await createServiceClient();
    const { data: existing, error: readError } = await supabase
      .from(TABLE)
      .select("metadata")
      .eq("id", requestId)
      .maybeSingle();

    if (readError) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to read transfer metadata: ${readError.message}`,
      });
    }

    const metadata = {
      ...(existing?.metadata ?? {}),
      archived_at: new Date().toISOString(),
      archived_by: archivedBy,
    };

    const { error } = await supabase
      .from(TABLE)
      .update({ metadata })
      .eq("id", requestId);

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to archive transfer request: ${error.message}`,
      });
    }
  }
}

function isArchived(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const archivedAt = (metadata as { archived_at?: unknown }).archived_at;
  return typeof archivedAt === "string" && archivedAt.trim().length > 0;
}
