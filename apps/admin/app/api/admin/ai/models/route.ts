import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditLogService } from "@/lib/audit";
import { unitPricing, isUnitPriced } from "@admin/lib/model-pricing";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inferenceSchema = (supabase as any).schema("inference");
    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

    const [{ data, error }, upstreamIds, endpointsRes, healthRes, servedRes] =
      await Promise.all([
        inferenceSchema
          .from("models")
          .select(
            "id, model_id, display_name, modality, serving_type, upstream_provider, upstream_model_id, org_id, pricing, upstream_pricing, provider_pricing, is_active, is_featured, sort_order, created_at",
          )
          .order("sort_order", { ascending: true })
          .order("model_id", { ascending: true }),
        fetchWokeyModelIds(),
        inferenceSchema.from("serving_endpoints").select("model_id, enabled"),
        inferenceSchema.from("endpoint_health").select("model_id, enabled, ok"),
        // Who actually served each model in the last 24h. upstream_provider
        // says which partner OWNS a model; with a primary/fallback chain the
        // partner that answered can differ per request, and only usage knows.
        // Bounded on purpose: this is a catalog page, not an analytics one.
        inferenceSchema
          .from("usage")
          .select("model_id, provider")
          .gte("created_at", dayAgo)
          .order("created_at", { ascending: false })
          .limit(SERVED_SAMPLE_CAP),
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

    // endpoints per model, and how many of them are actually serving
    const endpointCounts = new Map<string, { total: number; enabled: number }>();
    for (const e of (endpointsRes?.data ?? []) as {
      model_id: string;
      enabled: boolean;
    }[]) {
      const c = endpointCounts.get(e.model_id) ?? { total: 0, enabled: 0 };
      c.total += 1;
      if (e.enabled) c.enabled += 1;
      endpointCounts.set(e.model_id, c);
    }
    const healthCounts = new Map<string, { live: number; up: number }>();
    for (const h of (healthRes?.data ?? []) as {
      model_id: string;
      enabled: boolean;
      ok: boolean;
    }[]) {
      if (!h.enabled) continue;
      const c = healthCounts.get(h.model_id) ?? { live: 0, up: 0 };
      c.live += 1;
      if (h.ok) c.up += 1;
      healthCounts.set(h.model_id, c);
    }
    const servedRows = (servedRes?.data ?? []) as {
      model_id: string | null;
      provider: string | null;
    }[];
    const servedSplit = new Map<string, Record<string, number>>();
    for (const u of servedRows) {
      if (!u.model_id) continue;
      const key = u.provider ?? "unstamped";
      const m = servedSplit.get(u.model_id) ?? {};
      m[key] = (m[key] ?? 0) + 1;
      servedSplit.set(u.model_id, m);
    }
    const servedTruncated = servedRows.length >= SERVED_SAMPLE_CAP;

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

      // Margin now depends on WHO SERVED the request: the same model can be
      // deeply profitable on one partner and underwater on another, so a
      // single margin number would be a coin toss dressed as a fact.
      const perProvider = (m.provider_pricing ?? {}) as Record<
        string,
        Record<string, number | undefined>
      >;
      const providerMargins = Object.entries(perProvider).map(
        ([provider, cost]) => ({
          provider,
          input: marginPct(pricing?.input_cents_per_mtok, cost?.input_cents_per_mtok),
          output: marginPct(
            pricing?.output_cents_per_mtok,
            cost?.output_cents_per_mtok,
          ),
        }),
      );

      const endpoints = endpointCounts.get(m.model_id) ?? null;
      const health = healthCounts.get(m.model_id) ?? null;
      const split = servedSplit.get(m.model_id) ?? null;

      return {
        ...m,
        upstream_available,
        // Hosted models answer from our own pods; proxy models answer from a
        // partner. Both facts belong on the row that claims to describe how a
        // model is served.
        providerMargins,
        endpoints: endpoints
          ? { total: endpoints.total, enabled: endpoints.enabled }
          : null,
        podHealth: health ? { live: health.live, up: health.up } : null,
        servedLast24h: split
          ? Object.entries(split)
              .map(([provider, requests]) => ({ provider, requests }))
              .sort((a, b) => b.requests - a.requests)
          : null,
        // Media models are priced per image/second, not per Mtok — the
        // token margin below is null for them by construction, so carry the
        // real per-unit margin instead of showing a blank.
        unitPricing: unitPricing(
          String(m.modality),
          (m.pricing ?? null) as Record<string, unknown> | null,
          (m.upstream_pricing ?? null) as Record<string, unknown> | null,
        ),
        pricedPerUnit: isUnitPriced(
          String(m.modality),
          (m.pricing ?? null) as Record<string, unknown> | null,
        ),
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
        servedSampleTruncated: servedTruncated,
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

/** Rows of recent usage sampled to show who served each model. */
const SERVED_SAMPLE_CAP = 1000;

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
