import { createServiceClient } from "@/lib/supabase/server";
import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";
import type { DomainPurchaseRequestRepositoryPort } from "@/lib/domain-service/core/ports";
import type { DomainPurchaseRequest, DomainPurchaseRequestStatus } from "@/lib/domain-service/core/types";

const TABLE = "domain_purchase_requests";

export class SupabaseDomainPurchaseRequestRepository implements DomainPurchaseRequestRepositoryPort {
  async create(params: {
    userId: string;
    appId?: string | null;
    domain: string;
    purchasePrice?: number | null;
    renewalPrice?: number | null;
    currency?: string;
    provider?: string;
    idempotencyKey?: string | null;
    providerRequestId?: string | null;
    metadata?: Record<string, unknown>;
    status?: DomainPurchaseRequestStatus;
  }): Promise<DomainPurchaseRequest> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        user_id: params.userId,
        app_id: params.appId ?? null,
        domain: params.domain,
        status: params.status || "requested",
        purchase_price: params.purchasePrice ?? null,
        renewal_price: params.renewalPrice ?? null,
        currency: params.currency || "USD",
        provider: params.provider || "namecom",
        idempotency_key: params.idempotencyKey || null,
        provider_request_id: params.providerRequestId || null,
        metadata: params.metadata || {},
      })
      .select("*")
      .single();

    if (error) {
      // Handle racing idempotent writes where another request already inserted this key.
      if (error.code === "23505" && params.idempotencyKey) {
        const existing = await this.findByIdempotencyKey(params.userId, params.idempotencyKey);
        if (existing) {
          return existing;
        }
      }

      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to create domain purchase request: ${error.message}`,
      });
    }

    return data as DomainPurchaseRequest;
  }

  async findByIdForUser(requestId: string, userId: string): Promise<DomainPurchaseRequest | null> {
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
        message: `Failed to read domain purchase request: ${error.message}`,
      });
    }

    return (data || null) as DomainPurchaseRequest | null;
  }

  async findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<DomainPurchaseRequest | null> {
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
        message: `Failed to read purchase idempotency state: ${error.message}`,
      });
    }

    return (data || null) as DomainPurchaseRequest | null;
  }

  async findLatestByDomain(params: {
    userId: string;
    domain: string;
  }): Promise<DomainPurchaseRequest | null> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", params.userId)
      .eq("domain", params.domain)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to load latest domain purchase request: ${error.message}`,
      });
    }

    return (data || null) as DomainPurchaseRequest | null;
  }

  async listByUser(params: {
    userId: string;
    appId?: string;
    limit?: number;
  }): Promise<DomainPurchaseRequest[]> {
    const supabase = await createServiceClient();

    let query = supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", params.userId)
      .order("created_at", { ascending: false })
      .limit(params.limit || 20);

    if (params.appId) {
      query = query.eq("app_id", params.appId);
    }

    const { data, error } = await query;

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to list domain purchase requests: ${error.message}`,
      });
    }

    return (data || []) as DomainPurchaseRequest[];
  }

  async updateStatus(params: {
    requestId: string;
    status: DomainPurchaseRequestStatus;
    providerRequestId?: string | null;
    lastError?: string | null;
  }): Promise<void> {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .from(TABLE)
      .update({
        status: params.status,
        provider_request_id: params.providerRequestId ?? null,
        last_error: params.lastError ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.requestId);

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to update domain purchase request: ${error.message}`,
      });
    }
  }
}
