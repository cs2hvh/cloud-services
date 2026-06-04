import { bytesToPostgresBytea, encryptAesGcm } from "@/lib/inference/crypto";
import { recordAudit } from "@/lib/inference/audit";
import { createServiceClient } from "@/lib/supabase/server";

type SR<T> = { success: true; data: T } | { success: false; error: string; status?: number };

export const InferenceByokKeyService = {
  async list(orgId: string): Promise<SR<unknown[]>> {
    const db = await createServiceClient();
    const { data, error } = await db
      .schema("inference")
      .from("byok_keys")
      .select("id, name, provider, key_last_four, is_valid, last_verified_at, last_verify_error, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) return { success: false, error: "Failed to list BYOK keys" };
    return {
      success: true,
      data: (data ?? []).map((k) => ({
        id: k.id, name: k.name, provider: k.provider,
        preview: "••••••••" + k.key_last_four,
        is_valid: k.is_valid, last_verified_at: k.last_verified_at,
        last_verify_error: k.last_verify_error, created_at: k.created_at,
      })),
    };
  },

  async create(
    orgId: string, userId: string,
    input: { name: string; provider: string; api_key: string },
    audit: { ipAddress: string | null; userAgent: string | null }
  ): Promise<SR<unknown>> {
    const dek = process.env.BYOK_DEK;
    if (!dek) return { success: false, error: "BYOK_DEK is not configured on the server" };

    // Verify OpenRouter keys before storing — other providers skip in Phase 1
    let isValid = true;
    let verifyError: string | null = null;
    if (input.provider === "openrouter") {
      try {
        const resp = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${input.api_key}` } });
        if (!resp.ok) { isValid = false; verifyError = `OpenRouter returned ${resp.status}`; }
      } catch (err) { isValid = false; verifyError = err instanceof Error ? err.message : String(err); }
      if (!isValid) return { success: false, error: `BYOK key verification failed: ${verifyError}`, status: 400 };
    }

    let ciphertextHex: string;
    try {
      const cipherBytes = await encryptAesGcm(input.api_key, dek);
      ciphertextHex = bytesToPostgresBytea(cipherBytes);
    } catch (err) {
      console.error("[InferenceByokKeyService.create] encryption failed:", err);
      return { success: false, error: "Failed to encrypt BYOK key" };
    }

    const db = await createServiceClient();
    const { data, error } = await db
      .schema("inference")
      .from("byok_keys")
      .insert({
        org_id: orgId, added_by_user_id: userId, name: input.name, provider: input.provider,
        ciphertext: ciphertextHex, kms_key_version: 1,
        key_last_four: input.api_key.slice(-4),
        is_valid: isValid, last_verified_at: new Date().toISOString(), last_verify_error: verifyError,
      })
      .select("id, name, provider, key_last_four, is_valid, created_at")
      .single();

    if (error) {
      if (error.code === "23505") return { success: false, error: `A BYOK key with name "${input.name}" already exists in this org`, status: 409 };
      return { success: false, error: "Failed to store BYOK key" };
    }

    void recordAudit({ orgId, actorUserId: userId, action: "byok.added", targetType: "byok_key", targetId: data.id, metadata: { name: data.name, provider: data.provider, key_last_four: data.key_last_four, is_valid: data.is_valid }, ...audit });
    return { success: true, data };
  },

  async delete(orgId: string, id: string, userId: string, audit: { ipAddress: string | null; userAgent: string | null }): Promise<SR<{ deleted_id: string }>> {
    const db = await createServiceClient();
    const { error, count } = await db
      .schema("inference")
      .from("byok_keys")
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("org_id", orgId);

    if (error) return { success: false, error: "Failed to delete BYOK key" };
    if (!count) return { success: false, error: "BYOK key not found in this org", status: 404 };

    void recordAudit({ orgId, actorUserId: userId, action: "byok.removed", targetType: "byok_key", targetId: id, ...audit });
    return { success: true, data: { deleted_id: id } };
  },
};
