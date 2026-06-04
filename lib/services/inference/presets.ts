import { recordAudit } from "@/lib/inference/audit";
import { createServiceClient } from "@/lib/supabase/server";

type SR<T> = { success: true; data: T } | { success: false; error: string; status?: number };

export interface PresetConfig {
  models: string[];
  provider_sort?: "price" | "throughput" | "latency" | null;
  max_latency_ms?: number | null;
  allow_fallbacks?: boolean;
  preferred_max_price_per_mtok?: number | null;
}

export const InferencePresetService = {
  async list(orgId: string): Promise<SR<unknown[]>> {
    const db = await createServiceClient();
    const { data, error } = await db
      .schema("inference")
      .from("model_presets")
      .select("id, name, description, config, created_by_user_id, created_at, updated_at")
      .eq("org_id", orgId)
      .order("name", { ascending: true });
    if (error) return { success: false, error: "Failed to list presets" };
    return { success: true, data: data ?? [] };
  },

  async create(
    orgId: string, userId: string,
    input: { name: string; description?: string | null; config: PresetConfig },
    audit: { ipAddress: string | null; userAgent: string | null }
  ): Promise<SR<unknown>> {
    const db = await createServiceClient();
    const { data, error } = await db
      .schema("inference")
      .from("model_presets")
      .insert({ org_id: orgId, created_by_user_id: userId, name: input.name, description: input.description ?? null, config: input.config })
      .select("id, name, description, config, created_by_user_id, created_at, updated_at")
      .single();

    if (error) {
      if (error.code === "23505") return { success: false, error: `A preset named "${input.name}" already exists in this org`, status: 409 };
      return { success: false, error: "Failed to create preset" };
    }

    void recordAudit({
      orgId,
      actorUserId: userId,
      action: "org.updated",
      targetType: "model_preset",
      targetId: data.id,
      metadata: { event: "preset.created", name: data.name, config_models: input.config.models },
      ...audit,
    });
    return { success: true, data };
  },

  async update(
    orgId: string, id: string, userId: string,
    patch: { name?: string; description?: string | null; config?: PresetConfig },
    audit: { ipAddress: string | null; userAgent: string | null }
  ): Promise<SR<unknown>> {
    const db = await createServiceClient();
    const { data, error } = await db
      .schema("inference")
      .from("model_presets")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("org_id", orgId)
      .select("id, name, description, config, updated_at")
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
        return { success: false, error: "A preset with that name already exists", status: 409 };
      }
      return { success: false, error: "Preset not found in this org", status: 404 };
    }
    void recordAudit({
      orgId,
      actorUserId: userId,
      action: "org.updated",
      targetType: "model_preset",
      targetId: id,
      metadata: { event: "preset.updated", changed: Object.keys(patch), name: (data as { name?: unknown }).name },
      ...audit,
    });
    return { success: true, data };
  },

  async delete(orgId: string, id: string, userId: string, audit: { ipAddress: string | null; userAgent: string | null }): Promise<SR<{ deleted_id: string }>> {
    const db = await createServiceClient();
    const { data: existing } = await db
      .schema("inference")
      .from("model_presets")
      .select("id, name")
      .eq("id", id)
      .eq("org_id", orgId)
      .maybeSingle<{ id: string; name: string }>();

    if (!existing) return { success: false, error: "Preset not found in this org", status: 404 };

    const { error } = await db.schema("inference").from("model_presets").delete().eq("id", id).eq("org_id", orgId);
    if (error) return { success: false, error: "Failed to delete preset" };

    void recordAudit({
      orgId,
      actorUserId: userId,
      action: "org.updated",
      targetType: "model_preset",
      targetId: id,
      metadata: { event: "preset.deleted", name: existing.name },
      ...audit,
    });
    return { success: true, data: { deleted_id: id } };
  },
};
