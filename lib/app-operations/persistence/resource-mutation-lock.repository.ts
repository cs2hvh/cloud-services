import { createServiceClient } from "@/lib/supabase/server";
import type {
  AppMutationCategory,
  ResourceMutationKind,
  ResourceMutationLockRecord,
} from "@/lib/app-operations/core/types";

const TABLE = "platform_resource_mutation_locks";

function mapLock(record: Record<string, unknown>): ResourceMutationLockRecord {
  return {
    id: String(record.id),
    resource_kind: String(record.resource_kind) as ResourceMutationKind,
    resource_id: String(record.resource_id),
    category: String(record.category) as AppMutationCategory,
    holder: String(record.holder),
    operation_id: typeof record.operation_id === "string" ? record.operation_id : null,
    metadata:
      record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
        ? (record.metadata as Record<string, unknown>)
        : {},
    created_at: String(record.created_at),
    expires_at: String(record.expires_at),
  };
}

export class ResourceMutationLockRepository {
  async cleanupExpired(params: {
    resourceKind: ResourceMutationKind;
    resourceId: string;
    category: AppMutationCategory;
  }) {
    const supabase = await createServiceClient();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("resource_kind", params.resourceKind)
      .eq("resource_id", params.resourceId)
      .eq("category", params.category)
      .lte("expires_at", now);

    if (error) {
      throw new Error(`Failed to cleanup expired mutation locks: ${error.message}`);
    }
  }

  async findActiveByResource(params: {
    resourceKind: ResourceMutationKind;
    resourceId: string;
    category: AppMutationCategory;
  }): Promise<ResourceMutationLockRecord | null> {
    const supabase = await createServiceClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("resource_kind", params.resourceKind)
      .eq("resource_id", params.resourceId)
      .eq("category", params.category)
      .gt("expires_at", now)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to read mutation lock: ${error.message}`);
    }

    return data ? mapLock(data as Record<string, unknown>) : null;
  }

  async acquire(params: {
    resourceKind: ResourceMutationKind;
    resourceId: string;
    category: AppMutationCategory;
    holder: string;
    operationId?: string | null;
    metadata?: Record<string, unknown>;
    ttlMs?: number;
  }): Promise<{ lock: ResourceMutationLockRecord | null; conflict: ResourceMutationLockRecord | null }> {
    await this.cleanupExpired({
      resourceKind: params.resourceKind,
      resourceId: params.resourceId,
      category: params.category,
    });

    const supabase = await createServiceClient();
    const ttlMs = params.ttlMs ?? 30 * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        resource_kind: params.resourceKind,
        resource_id: params.resourceId,
        category: params.category,
        holder: params.holder,
        operation_id: params.operationId ?? null,
        metadata: params.metadata ?? {},
        expires_at: expiresAt,
      })
      .select("*")
      .single();

    if (!error && data) {
      return {
        lock: mapLock(data as Record<string, unknown>),
        conflict: null,
      };
    }

    if (error?.code === "23505") {
      const conflict = await this.findActiveByResource({
        resourceKind: params.resourceKind,
        resourceId: params.resourceId,
        category: params.category,
      });
      return { lock: null, conflict };
    }

    throw new Error(`Failed to acquire mutation lock: ${error?.message ?? "unknown error"}`);
  }

  async attachOperation(lockId: string, operationId: string) {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .from(TABLE)
      .update({
        operation_id: operationId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lockId);

    if (error) {
      throw new Error(`Failed to attach operation to mutation lock: ${error.message}`);
    }
  }

  async release(lockId: string) {
    const supabase = await createServiceClient();
    const { error } = await supabase.from(TABLE).delete().eq("id", lockId);
    if (error) {
      throw new Error(`Failed to release mutation lock: ${error.message}`);
    }
  }

  async releaseByOperationId(operationId: string) {
    const supabase = await createServiceClient();
    const { error } = await supabase.from(TABLE).delete().eq("operation_id", operationId);
    if (error) {
      throw new Error(`Failed to release operation mutation lock: ${error.message}`);
    }
  }
}
