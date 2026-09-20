import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * One row per model, across both partners and our own catalogue.
 *
 * This is the page that decides what customers can see. A row is the union
 * of three sources - Starimg's /v1/models, Wokey's, and everything already
 * in inference.models - so a model we switched off yesterday is still HERE,
 * as a row that is simply not ticked, rather than vanishing from the only
 * screen that could bring it back.
 *
 * Per partner a row is one of three states, and the third is the one that
 * matters: carried, not carried, or UNKNOWN. Unknown means the panel has no
 * key for that partner on this host and therefore could not ask. An empty
 * answer and an unasked question look identical unless something says so,
 * and only one of them means the partner dropped the model.
 *
 * Partner names and per-partner cost are operator-only; neither reaches a
 * customer surface.
 */

const TIMEOUT_MS = 8000;

type PartnerDef = {
  name: "starimg" | "wokey";
  baseUrl: string;
  key: string | undefined;
  keyVar: string;
};

function partnerDefs(): PartnerDef[] {
  return [
    {
      name: "starimg",
      baseUrl: process.env.STARIMG_BASE_URL || "https://ai.starimg.ru/v1",
      key: process.env.STARIMG_PLATFORM_KEY,
      keyVar: "STARIMG_PLATFORM_KEY",
    },
    {
      name: "wokey",
      baseUrl: process.env.WOKEY_BASE_URL || "https://api.wokey.ai/v1",
      key: process.env.WOKEY_PLATFORM_KEY,
      keyVar: "WOKEY_PLATFORM_KEY",
    },
  ];
}

type PartnerFetch = {
  partner: "starimg" | "wokey";
  reachable: boolean;
  reason: string | null;
  count: number;
  /** Every id form the partner answers to: raw, lowercased and bare. */
  ids: Set<string>;
  names: Map<string, string | null>;
};

async function fetchPartner(p: PartnerDef): Promise<PartnerFetch> {
  const empty: PartnerFetch = {
    partner: p.name,
    reachable: false,
    reason: null,
    count: 0,
    ids: new Set(),
    names: new Map(),
  };

  if (!p.key) {
    return {
      ...empty,
      reason: `${p.keyVar} is not in this host's environment, so the panel cannot ask ${p.name} what it serves`,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${p.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${p.key}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return { ...empty, reason: `returned ${res.status}` };
    const body = (await res.json()) as { data?: { id?: string; name?: string }[] };
    if (!Array.isArray(body.data)) {
      return { ...empty, reason: "unrecognised response shape" };
    }
    const ids = new Set<string>();
    const names = new Map<string, string | null>();
    let count = 0;
    for (const m of body.data) {
      if (typeof m?.id !== "string") continue;
      count += 1;
      const bare = m.id.split("/").pop() ?? m.id;
      for (const form of [m.id, m.id.toLowerCase(), bare, bare.toLowerCase()]) {
        ids.add(form);
      }
      names.set(m.id, m.name ?? null);
    }
    return { partner: p.name, reachable: true, reason: null, count, ids, names };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unreachable";
    return { ...empty, reason: msg };
  } finally {
    clearTimeout(timer);
  }
}

type CatalogRow = {
  id: string;
  model_id: string;
  display_name: string | null;
  upstream_model_id: string | null;
  upstream_provider: string | null;
  serving_type: string;
  modality: string;
  is_active: boolean;
  provider_pricing: Record<string, Record<string, unknown>> | null;
  upstream_pricing: Record<string, unknown> | null;
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Every form of an id a partner might answer to. */
function idForms(raw: string): string[] {
  const bare = raw.split("/").pop() ?? raw;
  return [raw, raw.toLowerCase(), bare, bare.toLowerCase()];
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  try {
    const [fetched, catalogue] = await Promise.all([
      Promise.all(partnerDefs().map(fetchPartner)),
      (async () => {
        const supabase = await createServiceClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inference = (supabase as any).schema("inference");
        const { data, error } = await inference
          .from("models")
          .select(
            "id, model_id, display_name, upstream_model_id, upstream_provider, serving_type, modality, is_active, provider_pricing, upstream_pricing",
          )
          .order("model_id");
        if (error) throw new Error(error.message);
        return (data ?? []) as CatalogRow[];
      })(),
    ]);

    const byPartner = new Map(fetched.map((f) => [f.partner, f]));

    /** carried / not carried / unknown, per partner, for one model. */
    const carriage = (row: CatalogRow | null, partnerIds: string[]) => {
      const out: Record<
        string,
        { carries: boolean | null; cost: { input: number | null; output: number | null } | null }
      > = {};
      for (const def of partnerDefs()) {
        const f = byPartner.get(def.name);
        let carries: boolean | null = null;
        if (f?.reachable) {
          const probes = [
            ...(row ? idForms(row.upstream_model_id ?? row.model_id) : []),
            ...(row ? idForms(row.model_id) : []),
            ...partnerIds.flatMap(idForms),
          ];
          carries = probes.some((x) => f.ids.has(x));
        }
        // Per-partner cost falls back to the default cost blob, which is
        // what the consumer does. Admin-only.
        const blob =
          (row?.provider_pricing?.[def.name] as Record<string, unknown> | undefined) ??
          (row?.upstream_pricing as Record<string, unknown> | undefined) ??
          null;
        out[def.name] = {
          carries,
          cost: blob
            ? {
                input: num(blob.input_cents_per_mtok),
                output: num(blob.output_cents_per_mtok),
              }
            : null,
        };
      }
      return out;
    };

    type Row = {
      key: string;
      modelUuid: string | null;
      ourModelId: string | null;
      displayName: string;
      upstreamModelId: string | null;
      servingType: string | null;
      modality: string | null;
      inCatalogue: boolean;
      isActive: boolean | null;
      servedBy: string | null;
      /** True when ticking a partner is meaningful: proxied models only. */
      partnerRoutable: boolean;
      partners: ReturnType<typeof carriage>;
      /** Set when a partner we CAN see no longer lists a live model. */
      liveButUnlisted: boolean;
    };

    const rows: Row[] = [];
    const claimed = new Set<string>();

    // 1. Everything we already carry - including the rows switched off, which
    //    is the whole point: they are hidden, not gone.
    for (const row of catalogue) {
      for (const form of [
        ...idForms(row.model_id),
        ...(row.upstream_model_id ? idForms(row.upstream_model_id) : []),
      ]) {
        claimed.add(form);
      }
      const partners = carriage(row, []);
      const routable = row.serving_type === "proxy";
      const servingPartner = row.upstream_provider
        ? partners[row.upstream_provider]
        : undefined;
      rows.push({
        key: row.model_id,
        modelUuid: row.id,
        ourModelId: row.model_id,
        displayName: row.display_name || row.model_id,
        upstreamModelId: row.upstream_model_id,
        servingType: row.serving_type,
        modality: row.modality,
        inCatalogue: true,
        isActive: row.is_active,
        servedBy: row.upstream_provider,
        partnerRoutable: routable,
        partners,
        liveButUnlisted:
          routable && row.is_active && servingPartner?.carries === false,
      });
    }

    // 2. Anything a partner offers that we do not carry at all.
    for (const f of fetched) {
      if (!f.reachable) continue;
      for (const [rawId, name] of f.names) {
        if (idForms(rawId).some((x) => claimed.has(x))) continue;
        claimed.add(rawId);
        for (const form of idForms(rawId)) claimed.add(form);
        rows.push({
          key: rawId,
          modelUuid: null,
          ourModelId: null,
          displayName: name || rawId,
          upstreamModelId: rawId,
          servingType: null,
          modality: null,
          inCatalogue: false,
          isActive: null,
          servedBy: null,
          partnerRoutable: true,
          partners: carriage(null, [rawId]),
          liveButUnlisted: false,
        });
      }
    }

    rows.sort((a, b) => {
      // Live first, then everything we carry, then the rest.
      const rank = (r: Row) => (r.isActive ? 0 : r.inCatalogue ? 1 : 2);
      const d = rank(a) - rank(b);
      return d !== 0 ? d : a.key.localeCompare(b.key);
    });

    return NextResponse.json({
      partners: fetched.map((f) => ({
        partner: f.partner,
        reachable: f.reachable,
        reason: f.reason,
        count: f.count,
      })),
      summary: {
        total: rows.length,
        live: rows.filter((r) => r.isActive).length,
        hidden: rows.filter((r) => r.inCatalogue && !r.isActive).length,
        notCarried: rows.filter((r) => !r.inCatalogue).length,
        liveButUnlisted: rows.filter((r) => r.liveButUnlisted).length,
      },
      rows,
    });
  } catch (err) {
    console.error("[Admin AI] partner catalog failed:", err);
    return NextResponse.json(
      { error: "Could not build the partner catalogue" },
      { status: 500 },
    );
  }
}
