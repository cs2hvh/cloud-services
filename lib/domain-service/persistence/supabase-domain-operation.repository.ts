import { createServiceClient } from "@/lib/supabase/server";
import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";
import type { DomainOperation } from "@/lib/domain-service/core/types";
import type { DomainOperationRepositoryPort } from "@/lib/domain-service/core/ports";

const TABLE = "domain_operations";

export class SupabaseDomainOperationRepository implements DomainOperationRepositoryPort {
  async create(params: {
    userId: string;
    action: string;
    domainId?: string | null;
    idempotencyKey?: string | null;
    requestData?: Record<string, unknown>;
    status?: "pending" | "running" | "succeeded" | "failed";
    responseData?: Record<string, unknown> | null;
  }): Promise<DomainOperation> {
    const supabase = await createServiceClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        user_id: params.userId,
        action: params.action,
        domain_id: params.domainId || null,
        idempotency_key: params.idempotencyKey || null,
        request_data: params.requestData || {},
        response_data: params.responseData || null,
        status: params.status || "pending",
        retryable: false,
        started_at: params.status === "running" ? now : null,
        finished_at: params.status === "succeeded" || params.status === "failed" ? now : null,
      })
      .select("*")
      .single();

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to create domain operation: ${error.message}`,
      });
    }

    return data as DomainOperation;
  }

  async findByIdForUser(operationId: string, userId: string): Promise<DomainOperation | null> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", operationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to read domain operation: ${error.message}`,
      });
    }

    return (data || null) as DomainOperation | null;
  }

  async findByIdempotencyKey(params: {
    userId: string;
    action: string;
    idempotencyKey: string;
  }): Promise<DomainOperation | null> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", params.userId)
      .eq("action", params.action)
      .eq("idempotency_key", params.idempotencyKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to read idempotency state: ${error.message}`,
      });
    }

    return (data || null) as DomainOperation | null;
  }

  async markRunning(operationId: string): Promise<void> {
    await this.patch(operationId, {
      status: "running",
      started_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
      retryable: false,
    });
  }

  async markSucceeded(operationId: string, responseData?: Record<string, unknown>): Promise<void> {
    await this.patch(operationId, {
      status: "succeeded",
      response_data: responseData || null,
      finished_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
      retryable: false,
    });
  }

  async markFailed(params: {
    operationId: string;
    code: string;
    message: string;
    retryable: boolean;
  }): Promise<void> {
    await this.patch(params.operationId, {
      status: "failed",
      error_code: params.code,
      error_message: params.message,
      retryable: params.retryable,
      finished_at: new Date().toISOString(),
    });
  }

  private async patch(operationId: string, patch: Record<string, unknown>): Promise<void> {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .from(TABLE)
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", operationId);

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to update domain operation: ${error.message}`,
      });
    }
  }
}
