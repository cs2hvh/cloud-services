import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditLogService } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Live model ids from Wokey (the sole upstream since the OpenRouter
 * migration). Best-effort: null when unreachable/unconfigured, so the UI
 * simply omits availability instead of guessing. Ids are indexed in both
 * raw and bare (post-slash) form to survive namespacing differences.
 */
async function fetchWokeyModelIds(): Promise<{
  ids: Set<string>;
  count: number;
} | null> {
  const key = process.env.WOKEY_PLATFORM_KEY;
  if (!key) return null;
  const base = process.env.WOKEY_BASE_URL || "https://api.wokey.ai/v1";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { id?: string }[] };
    if (!Array.isArray(body.data)) return null;
    const ids = new Set<string>();
    let count = 0;
    for (const m of body.data) {
      if (!m?.id) continue;
      count += 1;
      ids.add(m.id);
      ids.add(m.id.toLowerCase());
      const bare = m.id.split("/").pop();
      if (bare) ids.add(bare);
    }
    return { ids, count };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Inference model catalog for admin: every model (public catalog rows have
 * org_id NULL; org-private fine-tunes are flagged), with customer pricing,
 * upstream cost basis and computed margin.
 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  try {
    const supabase = await createServiceClient();
    const [{ data, error }, upstreamIds] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .schema("inference")
        .from("models")
        .select(
          "id, model_id, display_name, modality, serving_type, upstream_provider, upstream_model_id, org_id, pricing, upstream_pricing, is_active, is_featured, sort_order, created_at",
        )
        .order("sort_order", { ascending: true })
        .order("model_id", { ascending: true }),
      fetchWokeyModelIds(),
    ]);
    const upstreamIdSet = upstreamIds?.ids ?? null;

    if (error) {
      console.error("[Admin AI] models query failed:", error.message);
      return NextResponse.json(
        { error: "Failed to load models" },
        { status: 500 },
      );
    }

    type Pricing = {
      input_cents_per_mtok?: number;
      output_cents_per_mtok?: number;
      cached_cents_per_mtok?: number;
    } | null;

    const marginPct = (price?: number, cost?: number) =>
      typeof price === "number" && typeof cost === "number" && cost > 0
        ? Math.round(((price - cost) / cost) * 1000) / 10
        : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data ?? []).map((m: any) => {
      const pricing = (m.pricing ?? null) as Pricing;
      const upstream = (m.upstream_pricing ?? null) as Pricing;

      // Only proxy-served models depend on the upstream provider; fine-tunes
      // and BYO deployments serve from our own pods. Wokey ids may be bare
      // (claude-opus-5) while ours are namespaced — compare both forms.
      let upstream_available: boolean | null = null;
      if (m.serving_type === "proxy" && upstreamIdSet) {
        const id = String(m.upstream_model_id ?? "");
        upstream_available =
          upstreamIdSet.has(id) ||
          upstreamIdSet.has(id.toLowerCase()) ||
          upstreamIdSet.has(id.split("/").pop() ?? id);
      }

      return {
        ...m,
        upstream_available,
        margin: {
          input: marginPct(
            pricing?.input_cents_per_mtok,
            upstream?.input_cents_per_mtok,
          ),
          output: marginPct(
            pricing?.output_cents_per_mtok,
            upstream?.output_cents_per_mtok,
          ),
        },
      };
    });

    const orphaned = rows.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) => m.is_active && m.upstream_available === false,
    ).length;

    return NextResponse.json({
      data: rows,
      summary: {
        total: rows.length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        active: rows.filter((m: any) => m.is_active).length,
        orphaned,
        upstreamChecked: upstreamIds !== null,
        upstreamCount: upstreamIds?.count ?? null,
      },
    });
  } catch (err) {
    console.error("[Admin AI] models unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

const MODEL_ID_RE = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const PRICE_FIELDS = [
  "input_cents_per_mtok",
  "output_cents_per_mtok",
  "cached_cents_per_mtok",
] as const;

/**
 * Create a self-hosted ("bring your own pod") catalog model.
 *
 * Deliberately narrow: this creates the model row only. It is born
 * INACTIVE unless asked otherwise, because a model with no serving
 * endpoint yet cannot answer a request — endpoints are added next, and
 * activating before then would publish a model that 503s.
 */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok || !admin.userId) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const modelId = String(body.model_id ?? "").trim().toLowerCase();
  const displayName = String(body.display_name ?? "").trim();
  const upstreamModelId = String(body.upstream_model_id ?? "").trim();

  if (!MODEL_ID_RE.test(modelId)) {
    return NextResponse.json(
      { error: "model_id must be namespaced lowercase, e.g. vendor/model-name" },
      { status: 400 },
    );
  }
  if (!displayName) {
    return NextResponse.json({ error: "display_name is required" }, { status: 400 });
  }
  if (!upstreamModelId) {
    return NextResponse.json(
      { error: "upstream_model_id is required — the name the pod answers to" },
      { status: 400 },
    );
  }

  const pricingIn = (body.pricing ?? {}) as Record<string, unknown>;
  const pricing: Record<string, number> = {};
  for (const k of PRICE_FIELDS) {
    if (pricingIn[k] === undefined || pricingIn[k] === "") continue;
    const v = Number(pricingIn[k]);
    if (!Number.isFinite(v) || v < 0) {
      return NextResponse.json({ error: `${k} must be a number ≥ 0` }, { status: 400 });
    }
    pricing[k] = v;
  }
  if (pricing.input_cents_per_mtok === undefined || pricing.output_cents_per_mtok === undefined) {
    return NextResponse.json(
      { error: "input and output cents per Mtok are required — an unpriced model bills nothing" },
      { status: 400 },
    );
  }

  let capabilities: Record<string, unknown> = {};
  if (body.capabilities !== undefined && body.capabilities !== null) {
    if (typeof body.capabilities === "string") {
      try {
        capabilities = JSON.parse(body.capabilities) as Record<string, unknown>;
      } catch {
        return NextResponse.json({ error: "capabilities must be valid JSON" }, { status: 400 });
      }
    } else if (typeof body.capabilities === "object") {
      capabilities = body.capabilities as Record<string, unknown>;
    }
  }

  const sortOrder = Number(body.sort_order ?? 0);
  if (!Number.isInteger(sortOrder)) {
    return NextResponse.json({ error: "sort_order must be a whole number" }, { status: 400 });
  }

  try {
    const supabase = await createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inference = (supabase as any).schema("inference");

    const { data, error } = await inference
      .from("models")
      .insert({
        model_id: modelId,
        display_name: displayName,
        description: body.description ? String(body.description).slice(0, 1000) : null,
        modality: String(body.modality ?? "chat"),
        serving_type: "runpod_byo",
        upstream_provider: "custom",
        upstream_model_id: upstreamModelId,
        org_id: null, // public hosted model
        capabilities,
        pricing,
        // Pods bill by the hour, not per token: leaving upstream_pricing
        // null keeps per-token margin reports honest rather than implying
        // a token cost basis that does not exist.
        upstream_pricing: null,
        sort_order: sortOrder,
        is_featured: body.is_featured === true,
        is_active: body.is_active === true,
      })
      .select("id, model_id, display_name, serving_type, upstream_provider, is_active")
      .single();

    if (error) {
      const duplicate = error.code === "23505";
      return NextResponse.json(
        { error: duplicate ? `Model ${modelId} already exists` : error.message },
        { status: duplicate ? 409 : 500 },
      );
    }

    try {
      await AuditLogService.create({
        user_id: admin.userId,
        user_email: admin.email,
        user_role: "admin",
        action: "create",
        service_type: "ai_agent",
        service_id: data.id as string,
        service_name: `Model ${modelId}`,
        after_state: {
          model_id: modelId,
          display_name: displayName,
          serving_type: "runpod_byo",
          upstream_provider: "custom",
          upstream_model_id: upstreamModelId,
          pricing,
          is_active: data.is_active,
        },
        metadata: { via: "admin-panel", operation: "ai.model.create" },
      });
    } catch {
      // audit must never fail the mutation
    }

    return NextResponse.json({ success: true, model: data });
  } catch (err) {
    console.error("[Admin AI] model create failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
