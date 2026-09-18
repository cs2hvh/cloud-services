import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditLogService } from "@/lib/audit";

export const dynamic = "force-dynamic";

const PRICE_KEYS = [
  "input_cents_per_mtok",
  "output_cents_per_mtok",
  "cached_cents_per_mtok",
] as const;

/** What the partner charges us may include a cache-write rate ours does not. */
const UPSTREAM_TOKEN_KEYS = [
  "input_cents_per_mtok",
  "output_cents_per_mtok",
  "cached_cents_per_mtok",
  "cache_write_cents_per_mtok",
] as const;

const UNIT_KEYS = ["cents_per_image", "cents_per_media_second"] as const;

/** Partners we will accept a cost blob for. */
const KNOWN_PROVIDERS = ["starimg", "wokey"] as const;

/**
 * Merge a pricing blob, validating scalars and replacing `tiers` wholesale.
 * Tiers replace rather than merge so a removed size actually stops applying;
 * merging would leave a deleted resolution billing at its old rate forever.
 */
function mergePricing(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown>,
  scalarKeys: readonly string[],
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const merged: Record<string, unknown> = { ...(existing ?? {}) };
  for (const key of scalarKeys) {
    const value = incoming[key];
    if (value === undefined) continue;
    if (value === null || value === "") {
      delete merged[key];
      continue;
    }
    const n = Number(value);
    // Fractional cents are real here (0.56), so no rounding.
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: `${key} must be a number >= 0` };
    }
    merged[key] = n;
  }
  const tiersIn = incoming.tiers;
  if (tiersIn !== undefined) {
    if (tiersIn === null) {
      delete merged.tiers;
    } else if (typeof tiersIn === "object") {
      const tiers: Record<string, number> = {};
      for (const [tier, raw] of Object.entries(tiersIn as Record<string, unknown>)) {
        if (raw === "" || raw === null || raw === undefined) continue;
        if (!/^[A-Za-z0-9._-]{1,20}$/.test(tier)) {
          return { ok: false, error: `tier name "${tier}" is not a valid label` };
        }
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          return { ok: false, error: `tier "${tier}" must be a number >= 0` };
        }
        tiers[tier] = n;
      }
      merged.tiers = tiers;
    } else {
      return { ok: false, error: "tiers must be an object of tier -> cents" };
    }
  }
  return { ok: true, value: merged };
}

/**
 * Update a catalog model: activate/deactivate, feature, or set customer
 * pricing (cents per Mtok). Pricing merges over the existing jsonb so keys
 * not sent stay untouched. Every change is audited.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    is_active?: boolean;
    is_featured?: boolean;
    pricing?: Record<string, unknown>;
    upstream_pricing?: Record<string, unknown>;
    provider_pricing?: Record<string, Record<string, unknown>>;
  };

  const updates: Record<string, unknown> = {};
  if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
  if (typeof body.is_featured === "boolean")
    updates.is_featured = body.is_featured;

  try {
    const supabase = await createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inference = (supabase as any).schema("inference");

    const { data: existing, error: readErr } = await inference
      .from("models")
      .select("id, model_id, display_name, modality, pricing, upstream_pricing, provider_pricing, is_active, is_featured")
      .eq("id", id)
      .maybeSingle();

    if (readErr) {
      console.error("[Admin AI] model read failed:", readErr.message);
      return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    // Which keys are legal depends on the modality: a video model has no
    // per-Mtok rate and a chat model has no per-second rate, so accepting
    // either shape on either model would store a price nothing reads.
    const modality = String(existing.modality ?? "");
    const isUnit = modality === "image" || modality === "video";
    const priceKeys = isUnit ? UNIT_KEYS : PRICE_KEYS;
    const upstreamKeys = isUnit ? UNIT_KEYS : UPSTREAM_TOKEN_KEYS;

    if (body.pricing !== undefined) {
      const merged = mergePricing(
        (existing.pricing as Record<string, unknown> | null) ?? null,
        body.pricing,
        priceKeys,
      );
      if (!merged.ok) {
        return NextResponse.json({ error: merged.error }, { status: 400 });
      }
      updates.pricing = merged.value;
    }

    // UPSTREAM COST — what the partner charges us. Editable here because
    // margin is only ever as right as this number, and until now it could
    // only be whatever was seeded. The usage consumer reads it at flush
    // time, so a change applies to requests made after it, not before.
    if (body.upstream_pricing !== undefined) {
      const merged = mergePricing(
        (existing.upstream_pricing as Record<string, unknown> | null) ?? null,
        body.upstream_pricing,
        upstreamKeys,
      );
      if (!merged.ok) {
        return NextResponse.json({ error: merged.error }, { status: 400 });
      }
      updates.upstream_pricing = merged.value;
    }

    // PER-PROVIDER COST. upstream_pricing is the default (and Wokey's rate);
    // provider_pricing[name] overrides it for requests that partner served.
    // The consumer picks by usage.provider and falls back to the default, so
    // the same model can be profitable on one partner and loss-making on the
    // other — which is exactly what the seeded numbers show today.
    if (body.provider_pricing !== undefined) {
      const existingByProvider =
        ((existing.provider_pricing as Record<
          string,
          Record<string, unknown>
        > | null) ?? {});
      const next: Record<string, unknown> = { ...existingByProvider };

      for (const [provider, blob] of Object.entries(body.provider_pricing)) {
        if (!KNOWN_PROVIDERS.includes(provider as (typeof KNOWN_PROVIDERS)[number])) {
          return NextResponse.json(
            { error: `Unknown provider "${provider}"` },
            { status: 400 },
          );
        }
        // An explicit null clears that partner's override and returns it to
        // the default, which is different from setting every field to zero.
        if (blob === null) {
          delete next[provider];
          continue;
        }
        const merged = mergePricing(
          (existingByProvider[provider] as Record<string, unknown> | undefined) ??
            null,
          blob,
          upstreamKeys,
        );
        if (!merged.ok) {
          return NextResponse.json(
            { error: `${provider}: ${merged.error}` },
            { status: 400 },
          );
        }
        next[provider] = merged.value;
      }
      updates.provider_pricing = next;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await inference
      .from("models")
      .update(updates)
      .eq("id", id)
      .select(
        "id, model_id, display_name, modality, serving_type, org_id, pricing, upstream_pricing, provider_pricing, is_active, is_featured",
      )
      .single();

    if (error) {
      console.error("[Admin AI] model update failed:", error.message);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    try {
      await AuditLogService.create({
        user_id: admin.userId || "",
        user_email: admin.email,
        user_role: "admin",
        action: "update",
        service_type: "ai_agent",
        service_id: existing.model_id,
        service_name: existing.display_name || existing.model_id,
        metadata: {
          operation: "admin.inference.model.update",
          before: {
            pricing: existing.pricing,
            is_active: existing.is_active,
            is_featured: existing.is_featured,
          },
          updates,
        },
        user_agent: request.headers.get("user-agent") || undefined,
      });
    } catch {
      // audit must never fail the action
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[Admin AI] model update unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
