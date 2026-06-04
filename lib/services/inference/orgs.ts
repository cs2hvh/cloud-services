import { recordAudit } from "@/lib/inference/audit";
import { createServiceClient } from "@/lib/supabase/server";

type SR<T> = { success: true; data: T } | { success: false; error: string; status?: number };
type Role = "owner" | "admin" | "developer" | "viewer";

export interface OrgPatch {
  name?: string;
  zdr_default?: boolean;
  region_pin?: "us" | "eu" | "asia" | null;
  monthly_budget_cents?: number | null;
  hard_cap_cents?: number | null;
  semantic_cache_threshold?: number | null;
}

export const InferenceOrgService = {
  async get(orgId: string, fallback: { slug: string; name: string; role: Role; zdrDefault?: boolean }): Promise<SR<{ org: unknown; counts: Record<string, number> }>> {
    const db = await createServiceClient();
    const [{ data: orgRow }, { count: keyCount }, { count: memberCount }, { count: byokCount }] = await Promise.all([
      db.schema("inference").from("orgs").select("id, slug, name, zdr_default, region_pin, owner_user_id, monthly_budget_cents, hard_cap_cents, semantic_cache_threshold, created_at, updated_at").eq("id", orgId).maybeSingle(),
      db.schema("inference").from("api_keys").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("revoked_at", null),
      db.schema("inference").from("org_members").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "active"),
      db.schema("inference").from("byok_keys").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    ]);
    if (!orgRow) return { success: false, error: "Org not found", status: 404 };
    const row = orgRow as typeof orgRow & {
      semantic_cache_threshold: number | string | null;
    };
    const rawThreshold = row.semantic_cache_threshold ?? null;
    const semanticCacheThreshold =
      rawThreshold === null
        ? null
        : typeof rawThreshold === "number"
          ? rawThreshold
          : Number.parseFloat(String(rawThreshold));

    return {
      success: true,
      data: {
        org: {
          id: orgId,
          slug: fallback.slug,
          name: row.name ?? fallback.name,
          role: fallback.role,
          zdr_default: row.zdr_default ?? fallback.zdrDefault ?? false,
          region_pin: row.region_pin ?? null,
          owner_user_id: row.owner_user_id ?? null,
          monthly_budget_cents: row.monthly_budget_cents ?? null,
          hard_cap_cents: row.hard_cap_cents ?? null,
          semantic_cache_threshold: Number.isFinite(semanticCacheThreshold) ? semanticCacheThreshold : null,
          created_at: row.created_at ?? null,
          updated_at: row.updated_at ?? null,
        },
        counts: {
          active_api_keys: keyCount ?? 0,
          active_members: memberCount ?? 0,
          byok_keys: byokCount ?? 0,
        },
      },
    };
  },

  async update(orgId: string, userId: string, patch: OrgPatch, audit: { ipAddress: string | null; userAgent: string | null }): Promise<SR<unknown>> {
    const db = await createServiceClient();
    const { data, error } = await db
      .schema("inference")
      .from("orgs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", orgId)
      .select("id, slug, name, zdr_default, region_pin, monthly_budget_cents, hard_cap_cents, semantic_cache_threshold, updated_at")
      .single();

    if (error || !data) return { success: false, error: "Failed to update org settings" };

    const isBudgetChange = "monthly_budget_cents" in patch || "hard_cap_cents" in patch;
    void recordAudit({ orgId, actorUserId: userId, action: isBudgetChange ? "org.spend_cap_updated" : "org.updated", targetType: "org", targetId: orgId, metadata: { changed: Object.keys(patch) }, ...audit });
    return { success: true, data };
  },
};
