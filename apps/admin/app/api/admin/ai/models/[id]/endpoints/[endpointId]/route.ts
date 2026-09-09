import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditLogService } from "@/lib/audit";
import { encryptAesGcm, bytesToPostgresBytea } from "@/lib/inference/crypto";
import { validateBaseUrl } from "../route";

export const dynamic = "force-dynamic";

const SAFE_COLUMNS =
  "id, model_id, base_url, served_model_name, weight, enabled, label, created_at, updated_at";

/**
 * Edit or remove one serving endpoint. A key may be ROTATED here (send a new
 * plaintext api_key); it is re-encrypted server-side and never returned.
 * Omitting api_key leaves the stored key untouched.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; endpointId: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok || !admin.userId) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const { id, endpointId } = await params;
  const modelId = decodeURIComponent(id);
  const body = (await request.json().catch(() => ({}))) as {
    base_url?: string;
    api_key?: string;
    served_model_name?: string | null;
    weight?: number;
    label?: string | null;
    enabled?: boolean;
  };

  const updates: Record<string, unknown> = {};

  if (body.base_url !== undefined) {
    const check = validateBaseUrl(String(body.base_url));
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    updates.base_url = check.url;
  }
  if (body.weight !== undefined) {
    const w = Number(body.weight);
    if (!Number.isInteger(w) || w < 1) {
      return NextResponse.json({ error: "weight must be a whole number ≥ 1" }, { status: 400 });
    }
    updates.weight = w;
  }
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }
    updates.enabled = body.enabled;
  }
  if (body.served_model_name !== undefined) {
    const v = body.served_model_name?.toString().trim();
    updates.served_model_name = v ? v : null;
  }
  if (body.label !== undefined) {
    const v = body.label?.toString().trim();
    updates.label = v ? v : null;
  }

  let rotated = false;
  if (body.api_key !== undefined) {
    const apiKey = String(body.api_key).trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "api_key cannot be blank — omit the field to keep the current key" },
        { status: 400 },
      );
    }
    const dek = process.env.BYOK_DEK;
    if (!dek) {
      return NextResponse.json(
        {
          error:
            "BYOK_DEK is not set on this host, so the key cannot be encrypted. The existing key was left untouched.",
        },
        { status: 503 },
      );
    }
    updates.api_key_ct = bytesToPostgresBytea(await encryptAesGcm(apiKey, dek));
    rotated = true;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }
  updates.updated_at = new Date().toISOString();

  try {
    const supabase = await createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inference = (supabase as any).schema("inference");

    const { data, error } = await inference
      .from("serving_endpoints")
      .update(updates)
      .eq("id", endpointId)
      .eq("model_id", modelId)
      .select(SAFE_COLUMNS)
      .maybeSingle();

    if (error) {
      const duplicate = error.code === "23505";
      return NextResponse.json(
        {
          error: duplicate
            ? "That base_url is already an endpoint for this model"
            : error.message,
        },
        { status: duplicate ? 409 : 500 },
      );
    }
    if (!data) {
      return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
    }

    try {
      // The ciphertext is operational noise in an audit row and a secret in
      // shape if not in content — drop it, keep the fact of the rotation.
      const audited = { ...updates };
      delete audited.api_key_ct;
      await AuditLogService.create({
        user_id: admin.userId,
        user_email: admin.email,
        user_role: "admin",
        action: "update",
        service_type: "ai_agent",
        service_id: endpointId,
        service_name: `Serving endpoint for ${modelId}`,
        after_state: { ...audited, ...(rotated ? { api_key: "[rotated]" } : {}) },
        metadata: { via: "admin-panel", operation: "ai.serving_endpoint.update" },
      });
    } catch {
      // audit must never fail the mutation
    }

    return NextResponse.json({ success: true, endpoint: data });
  } catch (err) {
    console.error("[Admin AI] endpoint update failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; endpointId: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok || !admin.userId) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const { id, endpointId } = await params;
  const modelId = decodeURIComponent(id);

  try {
    const supabase = await createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inference = (supabase as any).schema("inference");

    // Removing the last enabled endpoint takes the model offline — say so
    // rather than letting it happen quietly.
    const { data: siblings } = await inference
      .from("serving_endpoints")
      .select("id, enabled")
      .eq("model_id", modelId);
    const remainingEnabled = ((siblings ?? []) as { id: string; enabled: boolean }[]).filter(
      (e) => e.enabled && e.id !== endpointId,
    ).length;

    const { data, error } = await inference
      .from("serving_endpoints")
      .delete()
      .eq("id", endpointId)
      .eq("model_id", modelId)
      .select("id, base_url")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });

    try {
      await AuditLogService.create({
        user_id: admin.userId,
        user_email: admin.email,
        user_role: "admin",
        action: "delete",
        service_type: "ai_agent",
        service_id: endpointId,
        service_name: `Serving endpoint for ${modelId}`,
        before_state: { model_id: modelId, base_url: data.base_url },
        metadata: {
          via: "admin-panel",
          operation: "ai.serving_endpoint.delete",
          remaining_enabled: remainingEnabled,
        },
      });
    } catch {
      // audit must never fail the mutation
    }

    return NextResponse.json({ success: true, remainingEnabled });
  } catch (err) {
    console.error("[Admin AI] endpoint delete failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
