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

/** Partners reached through per-key endpoint rows rather than a shared API. */
const ENDPOINT_PARTNER_NAMES = ["abliteration"] as const;

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
      baseUrl: process.env.STARIMG_BASE_URL || "https://starimg.ru/ai/common/v1",
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
  /** Which host we actually asked. An env override on the deployed host can
   *  differ from the default in this file, and a stale one reads as a plain
   *  401 unless the URL is shown beside it. */
  baseUrl: string;
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
    baseUrl: p.baseUrl,
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
    return {
      partner: p.name,
      reachable: true,
      reason: null,
      count,
      baseUrl: p.baseUrl,
      ids,
      names,
    };
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

/**
 * Whether a partner's /v1/models list is evidence about this modality.
 *
 * It is an OpenAI-compatible CHAT model list: Wokey returns 30 text models
 * and not one of the image or video models it demonstrably serves for us
 * today. So for media, "absent from the list" is not evidence of absence -
 * it is evidence the list does not cover media.
 *
 * Finding a media model there still counts as proof it is carried. Only the
 * negative is withheld, because only the negative is unsupported.
 */
function listEnumerates(modality: string | null): boolean {
  if (modality === null) return true; // came from the list, so it is on it
  return modality === "chat" || modality === "text";
}

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

    // Abliteration is reached through per-key endpoint rows, not a shared
    // API, so there is no /models call to make and no platform key on this
    // host. Its evidence is the endpoints themselves: a model it serves has
    // rows pointing at it, one per key, each probed like any other.
    const supabase2 = await createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inf2 = (supabase2 as any).schema("inference");
    const [epRes, ehRes] = await Promise.all([
      inf2.from("serving_endpoints").select("id, model_id, enabled, label, base_url"),
      inf2.from("endpoint_health").select("endpoint_id, ok, enabled"),
    ]);
    const healthByEndpoint = new Map<string, { ok: boolean }>();
    for (const h of (ehRes.data ?? []) as { endpoint_id: string; ok: boolean }[]) {
      healthByEndpoint.set(h.endpoint_id, { ok: Boolean(h.ok) });
    }
    type EpTally = { total: number; enabled: number; up: number };
    const endpointsByModel = new Map<string, EpTally>();
    for (const e of (epRes.data ?? []) as {
      id: string;
      model_id: string;
      enabled: boolean;
    }[]) {
      const t = endpointsByModel.get(e.model_id) ?? { total: 0, enabled: 0, up: 0 };
      t.total += 1;
      if (e.enabled) {
        t.enabled += 1;
        if (healthByEndpoint.get(e.id)?.ok) t.up += 1;
      }
      endpointsByModel.set(e.model_id, t);
    }

    const byPartner = new Map(fetched.map((f) => [f.partner, f]));

    /** carried / not carried / unknown, per partner, for one model. */
    const carriage = (row: CatalogRow | null, partnerIds: string[]) => {
      const out: Record<
        string,
        {
          carries: boolean | null;
          cost: { input: number | null; output: number | null } | null;
          configured?: { total: number; enabled: number; up: number } | null;
        }
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
          const found = probes.some((x) => f.ids.has(x));
          // A miss only means "not carried" where the list covers the
          // modality. Otherwise the honest answer is that we do not know.
          carries = found
            ? true
            : listEnumerates(row?.modality ?? null)
              ? false
              : null;
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

      // The endpoint partner. "Carried" here is a fact about OUR
      // configuration, not about them: we hold keys for this model or we do
      // not. They may well serve others - we simply have no way to ask, and
      // adding keys is the endpoints screen's job, not a tick here.
      for (const name of ENDPOINT_PARTNER_NAMES) {
        const tally = row ? endpointsByModel.get(row.model_id) : undefined;
        const onThisPartner = row?.upstream_provider === name;
        const blob =
          (row?.provider_pricing?.[name] as Record<string, unknown> | undefined) ??
          null;
        out[name] = {
          carries: onThisPartner && (tally?.total ?? 0) > 0 ? true : false,
          configured: onThisPartner ? (tally ?? null) : null,
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
      partnerIsFixed: boolean;
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
      // A partner column can be ticked when the model is proxied (we choose
      // the partner) OR already served by an endpoint partner (we choose
      // only whether customers see it - the partner is fixed by its keys).
      const routable =
        row.serving_type === "proxy" ||
        (ENDPOINT_PARTNER_NAMES as readonly string[]).includes(
          row.upstream_provider ?? "",
        );
      const servingPartner = row.upstream_provider
        ? partners[row.upstream_provider]
        : undefined;
      rows.push({
        // Whether the partner is ours to choose. Fixed for an endpoint
        // partner: moving a model there means adding keys, not ticking.
        partnerIsFixed:
          row.serving_type !== "proxy" &&
          (ENDPOINT_PARTNER_NAMES as readonly string[]).includes(
            row.upstream_provider ?? "",
          ),
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
          partnerIsFixed: false,
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
      partners: [
        ...fetched.map((f) => ({
          partner: f.partner as string,
          reachable: f.reachable,
          reason: f.reason,
          count: f.count,
          baseUrl: f.baseUrl,
          evidence: "models_api" as const,
        })),
        // Counted from our own endpoint rows, so it is always answerable -
        // there is nothing to be unreachable.
        ...ENDPOINT_PARTNER_NAMES.map((name) => {
          const mine = catalogue.filter((c) => c.upstream_provider === name);
          const tally = mine.reduce(
            (acc, c) => {
              const t = endpointsByModel.get(c.model_id);
              acc.keys += t?.enabled ?? 0;
              acc.up += t?.up ?? 0;
              return acc;
            },
            { keys: 0, up: 0 },
          );
          return {
            partner: name as string,
            reachable: true,
            reason: `${tally.up}/${tally.keys} keys answering across ${mine.length} model(s) — health comes from our own probes, not a models API`,
            count: mine.length,
            baseUrl: "per-endpoint",
            evidence: "endpoints" as const,
          };
        }),
      ],
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
