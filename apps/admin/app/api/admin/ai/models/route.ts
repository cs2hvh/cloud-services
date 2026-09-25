import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditLogService } from "@/lib/audit";
import { unitPricing, isUnitPriced } from "@admin/lib/model-pricing";
import {
  impliedDiscountPct,
  isListPriced,
  pricingDrift,
} from "@admin/lib/list-pricing";
import { endpointNoun, servedByOwnPods } from "@admin/lib/serving";

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
            "id, model_id, display_name, modality, serving_type, upstream_provider, upstream_model_id, org_id, pricing, upstream_pricing, provider_pricing, list_pricing, discount_pct, openrouter_id, is_active, is_featured, sort_order, created_at",
          )
          .order("sort_order", { ascending: true })
          .order("model_id", { ascending: true }),
        fetchWokeyModelIds(),
        inferenceSchema
          .from("serving_endpoints")
          .select("id, model_id, enabled, provider"),
        inferenceSchema
          .from("endpoint_health")
          .select("endpoint_id, model_id, enabled, ok"),
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
    // Who answers at each ROW, not each model. One model can mix a
    // partner's API keys with a machine of our own, and counting the keys
    // as pods would make a partner's outage read as ours.
    const rowProvider = new Map<string, string | null>();
    // Which partners actually answer somewhere on a model. Its own
    // upstream_provider can be 'custom' while a partner answers on one of
    // its rows, so the rows have to be asked or that partner is invisible.
    const providersOnModel = new Map<string, Set<string>>();
    for (const e of (endpointsRes?.data ?? []) as {
      id: string;
      model_id: string;
      provider: string | null;
    }[]) {
      rowProvider.set(e.id, e.provider ?? null);
      if (e.provider && e.provider !== "custom") {
        const set = providersOnModel.get(e.model_id) ?? new Set<string>();
        set.add(e.provider);
        providersOnModel.set(e.model_id, set);
      }
    }

    const healthCounts = new Map<string, { live: number; up: number }>();
    // The same counts, split by what each row actually is.
    type Split = { pods: { live: number; up: number }; keys: { live: number; up: number } };
    const servingSplit = new Map<string, Split>();
    for (const h of (healthRes?.data ?? []) as {
      endpoint_id: string;
      model_id: string;
      enabled: boolean;
      ok: boolean;
    }[]) {
      if (!h.enabled) continue;
      const rp = rowProvider.get(h.endpoint_id) ?? null;
      const sp =
        servingSplit.get(h.model_id) ??
        { pods: { live: 0, up: 0 }, keys: { live: 0, up: 0 } };
      // A row with no provider of its own inherits the model's, resolved
      // below; here we only know it is not explicitly a partner's.
      const bucket = rp === null || rp === "custom" ? "inherit" : "partner";
      if (bucket === "partner") {
        sp.keys.live += 1;
        if (h.ok) sp.keys.up += 1;
      } else {
        sp.pods.live += 1;
        if (h.ok) sp.pods.up += 1;
      }
      servingSplit.set(h.model_id, sp);
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

    // Two catalog rows can send the SAME name upstream while being entirely
    // different products at different prices — the hosted GLM build and the
    // partner-served one both send "glm-5.3-flash", 22x apart in price. Near
    // identical names plus a shared upstream id is how the wrong row gets
    // edited, so each says which other row it shares with.
    const upstreamIdOwners = new Map<string, string[]>();
    for (const m of (data ?? []) as {
      upstream_model_id: string | null;
      model_id: string;
      is_active: boolean;
    }[]) {
      if (!m.is_active || !m.upstream_model_id) continue;
      const list = upstreamIdOwners.get(m.upstream_model_id) ?? [];
      list.push(m.model_id);
      upstreamIdOwners.set(m.upstream_model_id, list);
    }

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
        sharesUpstreamIdWith: (
          upstreamIdOwners.get(String(m.upstream_model_id ?? "")) ?? []
        ).filter((id) => id !== m.model_id),
        // THE FOUR LAYERS. Real cost is admin-only and is already on the
        // row as provider_pricing/upstream_pricing; these three describe how
        // the customer price was arrived at rather than merely what it is.
        // HOW it is reached and WHO serves it are separate. An endpoint-
        // served model can be entirely a partner's, one endpoint row per
        // API key - calling those "pods" would invent hardware.
        ownPods: servedByOwnPods(m.serving_type, m.upstream_provider),
        endpointProviders: [...(providersOnModel.get(m.model_id) ?? [])].sort(),
        // A partner answering here with no rate of its own: its cost is
        // unknown, and must not borrow the default blob, which belongs to
        // whoever came before it.
        partnersWithoutCost: [...(providersOnModel.get(m.model_id) ?? [])]
          .filter(
            (prov) =>
              !(
                (m.provider_pricing ?? {}) as Record<string, unknown>
              )[prov],
          )
          .sort(),
        // A row that names no provider inherits the model's, so a model on
        // a partner whose rows are unmarked is all keys; one on 'custom' is
        // all pods. Rows that DO name a partner were already counted as
        // keys above, whatever the model says.
        serving: (() => {
          const sp = servingSplit.get(m.model_id);
          if (!sp) return null;
          const inheritsPartner =
            m.upstream_provider && m.upstream_provider !== "custom";
          return inheritsPartner
            ? {
                pods: { live: 0, up: 0 },
                keys: {
                  live: sp.keys.live + sp.pods.live,
                  up: sp.keys.up + sp.pods.up,
                },
              }
            : sp;
        })(),
        endpointNoun: endpointNoun(m.serving_type, m.upstream_provider),
        listPriced: isListPriced(m.list_pricing),
        discountPct: Number(m.discount_pct ?? 0),
        // What the stored price implies, for rows that have a list price but
        // were priced before discount_pct existed. Shown, never written.
        impliedDiscountPct: impliedDiscountPct(m.pricing, m.list_pricing),
        // Where the stored price disagrees with list x (1 - discount). The
        // panel maintains that invariant on write; anything already in the
        // table predates it, and a drifted row is reported rather than
        // quietly rewritten - what a customer was charged is a fact.
        priceDrift: pricingDrift(
          m.pricing,
          m.list_pricing,
          Number(m.discount_pct ?? 0),
        ),
        placeholderPrice: looksLikePlaceholderPrice(
          (m.pricing ?? null) as Record<string, unknown> | null,
          (m.provider_pricing ?? null) as Record<
            string,
            Record<string, unknown>
          > | null,
        ),
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
      listPriced: rows.filter(
        (r: { is_active: boolean; listPriced: boolean }) =>
          r.is_active && r.listPriced,
      ).length,
      drifted: rows.filter(
        (r: { is_active: boolean; priceDrift: unknown[] }) =>
          r.is_active && r.priceDrift.length > 0,
      ).length,
      placeholderPriced: rows.filter(
        (r: { is_active: boolean; placeholderPrice: boolean }) =>
          r.is_active && r.placeholderPrice,
      ).length,
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

/**
 * New catalog rows arrive priced at a placeholder: five times the partner's
 * cost, with cached at a tenth of input. That is a seed, not a decision, and
 * it is indistinguishable from a real price unless something says so.
 *
 * Detected by signature rather than by a list of model ids, so it clears
 * itself the moment a real price is set and never needs maintaining. Both
 * conditions must hold — one alone is an easy coincidence, both together is
 * not — and the flag is reported as "looks seeded", never as fact.
 */
function looksLikePlaceholderPrice(
  pricing: Record<string, unknown> | null,
  providerPricing: Record<string, Record<string, unknown>> | null,
): boolean {
  const price = Number(pricing?.input_cents_per_mtok);
  const cached = Number(pricing?.cached_cents_per_mtok);
  const cost = Number(providerPricing?.starimg?.input_cents_per_mtok);
  if (!Number.isFinite(price) || !Number.isFinite(cost) || cost <= 0) return false;
  const ratio = price / cost;
  if (ratio < 4.9 || ratio > 5.1) return false;
  if (!Number.isFinite(cached) || price <= 0) return false;
  const cachedRatio = cached / price;
  return cachedRatio >= 0.09 && cachedRatio <= 0.11;
}

const MODEL_ID_RE = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const PRICE_FIELDS = [
  "input_cents_per_mtok",
  "output_cents_per_mtok",
  "cached_cents_per_mtok",
] as const;

/** Partners that may carry a proxied model. Strict routing, no fallback. */
const CREATE_PARTNERS = ["starimg", "wokey"] as const;

/**
 * Create a catalog model - either self-hosted ("bring your own pod") or
 * proxied to a partner.
 *
 * Deliberately narrow: this creates the model row only. It is born
 * INACTIVE unless asked otherwise, because a model with no serving
 * endpoint yet cannot answer a request — endpoints are added next, and
 * activating before then would publish a model that 503s. A proxied model
 * is born inactive for the same reason by a different route: nothing has
 * confirmed the partner answers to that name until a request tries it.
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

  // Proxied models are carried by a partner; hosted ones answer from our own
  // pods. The two differ in what "upstream" even means, so the shape is
  // decided here rather than inferred later.
  const servingType = String(body.serving_type ?? "runpod_byo");
  if (servingType !== "runpod_byo" && servingType !== "proxy") {
    return NextResponse.json(
      { error: "serving_type must be runpod_byo or proxy" },
      { status: 400 },
    );
  }
  const isProxy = servingType === "proxy";
  const partner = String(body.upstream_provider ?? "").trim();
  if (isProxy && !CREATE_PARTNERS.includes(partner as (typeof CREATE_PARTNERS)[number])) {
    return NextResponse.json(
      {
        error: `A proxied model needs a partner to carry it: ${CREATE_PARTNERS.join(" or ")}`,
      },
      { status: 400 },
    );
  }

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
      {
        error: isProxy
          ? "upstream_model_id is required — the exact name the partner answers to"
          : "upstream_model_id is required — the name the pod answers to",
      },
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
        serving_type: servingType,
        upstream_provider: isProxy ? partner : "custom",
        upstream_model_id: upstreamModelId,
        org_id: null, // public hosted model
        capabilities,
        pricing,
        // Pods bill by the hour, not per token: leaving upstream_pricing
        // null keeps per-token margin reports honest rather than implying
        // a token cost basis that does not exist. A proxied model does have
        // a per-token cost, but we do not know it yet - null says so, and a
        // guess would be reported as margin.
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
