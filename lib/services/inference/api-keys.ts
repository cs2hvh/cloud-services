/**
 * Inference API Key Service
 *
 * All business logic for inference.api_keys lives here.
 * Route handlers call these methods — no DB queries, no billing
 * calls, no audit writes in the route file itself.
 */
import { randomBytes, createHash } from "crypto";
import { recordAudit, type InferenceAuditAction } from "@/lib/inference/audit";
import { createServiceClient } from "@/lib/supabase/server";

// ─── Types ────────────────────────────────────────────────────────

export interface ApiKeyRow {
  id: string;
  name: string;
  preview: string;
  allowed_models: string[] | null;
  allowed_ip_cidrs: string[] | null;
  zdr_enabled: boolean;
  semantic_cache_enabled: boolean;
  rate_limit_rpm: number | null;
  monthly_budget_cents: number | null;
  hard_cap_cents: number | null;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

// Shape returned by create — matches the original route's response exactly.
// key_prefix + key_last_four kept separate (not merged into preview) because
// the dashboard reads them individually for display.
export interface ApiKeyCreated {
  id: string;
  name: string;
  key_prefix: string;
  key_last_four: string;
  created_at: string;
  api_key: string;
}

export interface CreateApiKeyInput {
  name: string;
  allowed_models?: string[] | null;
  allowed_ip_cidrs?: string[] | null;
  zdr_enabled?: boolean;
  semantic_cache_enabled?: boolean;
  monthly_budget_cents?: number | null;
  hard_cap_cents?: number | null;
  rate_limit_rpm?: number | null;
  expires_at?: string | null;
}

type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string; status?: number };

// ─── Service ──────────────────────────────────────────────────────

export const InferenceApiKeyService = {
  async list(orgId: string): Promise<ServiceResult<ApiKeyRow[]>> {
    const db = await createServiceClient();
    const { data, error } = await db
      .schema("inference")
      .from("api_keys")
      .select(
        "id, name, key_prefix, key_last_four, allowed_models, allowed_ip_cidrs, zdr_enabled, semantic_cache_enabled, monthly_budget_cents, hard_cap_cents, rate_limit_rpm, expires_at, last_used_at, created_at"
      )
      .eq("org_id", orgId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[InferenceApiKeyService.list]", error);
      return { success: false, error: "Failed to list API keys" };
    }

    return {
      success: true,
      data: (data ?? []).map((k) => ({
        id: k.id,
        name: k.name,
        preview: `${k.key_prefix}••••${k.key_last_four}`,
        allowed_models: k.allowed_models,
        allowed_ip_cidrs: k.allowed_ip_cidrs,
        zdr_enabled: k.zdr_enabled,
        semantic_cache_enabled: k.semantic_cache_enabled,
        rate_limit_rpm: k.rate_limit_rpm,
        monthly_budget_cents: k.monthly_budget_cents,
        hard_cap_cents: k.hard_cap_cents,
        expires_at: k.expires_at,
        last_used_at: k.last_used_at,
        created_at: k.created_at,
      })),
    };
  },

  async create(
    orgId: string,
    userId: string,
    input: CreateApiKeyInput,
    audit: { ipAddress: string | null; userAgent: string | null }
  ): Promise<ServiceResult<ApiKeyCreated>> {
    // Generate key — format: ahu_live_<32 url-safe random chars>
    const random = randomBytes(24).toString("base64url").slice(0, 32);
    const fullKey = `ahu_live_${random}`;
    const keyPrefix = fullKey.slice(0, 13);
    const keyLastFour = fullKey.slice(-4);
    const keyHash = createHash("sha256").update(fullKey).digest("hex");

    const db = await createServiceClient();
    const { data, error } = await db
      .schema("inference")
      .from("api_keys")
      .insert({
        org_id: orgId,
        created_by_user_id: userId,
        name: input.name,
        key_prefix: keyPrefix,
        key_last_four: keyLastFour,
        key_hash: keyHash,
        allowed_models: input.allowed_models ?? null,
        allowed_ip_cidrs: input.allowed_ip_cidrs ?? null,
        zdr_enabled: input.zdr_enabled ?? false,
        semantic_cache_enabled: input.semantic_cache_enabled ?? false,
        monthly_budget_cents: input.monthly_budget_cents ?? null,
        hard_cap_cents: input.hard_cap_cents ?? null,
        rate_limit_rpm: input.rate_limit_rpm ?? null,
        expires_at: input.expires_at ?? null,
      })
      .select("id, name, key_prefix, key_last_four, created_at")
      .single();

    if (error) {
      console.error("[InferenceApiKeyService.create]", error);
      return { success: false, error: "Failed to create API key" };
    }

    // Fire-and-forget audit
    void recordAudit({
      orgId,
      actorUserId: userId,
      action: "key.created",
      targetType: "api_key",
      targetId: data.id,
      metadata: {
        name: data.name,
        key_prefix: data.key_prefix,
        zdr_enabled: input.zdr_enabled ?? false,
        monthly_budget_cents: input.monthly_budget_cents ?? null,
        hard_cap_cents: input.hard_cap_cents ?? null,
      },
      ...audit,
    });

    // Return exactly what the original route returned: the DB row + the
    // show-once plaintext key. key_prefix and key_last_four are kept
    // separate (not merged into preview) to preserve the original shape.
    return {
      success: true,
      data: {
        id: data.id,
        name: data.name,
        key_prefix: data.key_prefix,
        key_last_four: data.key_last_four,
        created_at: data.created_at,
        api_key: fullKey,
      },
    };
  },

  async get(orgId: string, keyId: string): Promise<ServiceResult<ApiKeyRow>> {
    const db = await createServiceClient();
    const { data, error } = await db
      .schema("inference")
      .from("api_keys")
      .select(
        "id, name, key_prefix, key_last_four, allowed_models, allowed_ip_cidrs, zdr_enabled, semantic_cache_enabled, monthly_budget_cents, hard_cap_cents, rate_limit_rpm, expires_at, last_used_at, created_at"
      )
      .eq("id", keyId)
      .eq("org_id", orgId)
      .is("revoked_at", null)
      .maybeSingle();

    if (error || !data) return { success: false, error: "API key not found", status: 404 };
    return {
      success: true,
      data: {
        id: data.id,
        name: data.name,
        preview: `${data.key_prefix}••••${data.key_last_four}`,
        allowed_models: data.allowed_models,
        allowed_ip_cidrs: data.allowed_ip_cidrs,
        zdr_enabled: data.zdr_enabled,
        semantic_cache_enabled: data.semantic_cache_enabled,
        rate_limit_rpm: data.rate_limit_rpm,
        monthly_budget_cents: data.monthly_budget_cents,
        hard_cap_cents: data.hard_cap_cents,
        expires_at: data.expires_at,
        last_used_at: data.last_used_at,
        created_at: data.created_at,
      },
    };
  },

  async update(
    orgId: string,
    keyId: string,
    userId: string,
    patch: Partial<Omit<CreateApiKeyInput, "expires_at"> & { name?: string }>,
    audit: { ipAddress: string | null; userAgent: string | null }
  ): Promise<ServiceResult<Record<string, unknown>>> {
    const db = await createServiceClient();
    const { data, error } = await db
      .schema("inference")
      .from("api_keys")
      .update(patch)
      .eq("id", keyId)
      .eq("org_id", orgId)
      .is("revoked_at", null)
      .select("id, name, key_prefix, key_last_four, allowed_models, monthly_budget_cents, hard_cap_cents, zdr_enabled")
      .single();

    if (error || !data) return { success: false, error: "API key not found in this org", status: 404 };

    // Emit one audit event per changed axis (budget vs scope) — matches original behaviour
    const changedKeys = Object.keys(patch);
    const budgetChanged = changedKeys.some((k) => k === "monthly_budget_cents" || k === "hard_cap_cents");
    const scopeChanged = changedKeys.some((k) =>
      ["allowed_models", "allowed_ip_cidrs", "zdr_enabled", "semantic_cache_enabled", "rate_limit_rpm", "name"].includes(k)
    );
    const actions: InferenceAuditAction[] = [];
    if (budgetChanged) actions.push("key.budget_changed");
    if (scopeChanged) actions.push("key.scope_changed");
    for (const action of actions) {
      void recordAudit({
        orgId,
        actorUserId: userId,
        action,
        targetType: "api_key",
        targetId: keyId,
        metadata: { changed: changedKeys, after: patch },
        ...audit,
      });
    }
    return { success: true, data };
  },

  async revoke(
    orgId: string,
    keyId: string,
    userId: string,
    audit: { ipAddress: string | null; userAgent: string | null }
  ): Promise<ServiceResult<{ id: string }>> {
    const db = await createServiceClient();
    const { data, error } = await db
      .schema("inference")
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", keyId)
      .eq("org_id", orgId)
      .is("revoked_at", null)
      .select("id, name")
      .single();

    if (error || !data) {
      return { success: false, error: "API key not found or already revoked", status: 404 };
    }

    void recordAudit({
      orgId,
      actorUserId: userId,
      action: "key.revoked",
      targetType: "api_key",
      targetId: keyId,
      metadata: { name: data.name },
      ...audit,
    });

    return { success: true, data: { id: keyId } };
  },
};
