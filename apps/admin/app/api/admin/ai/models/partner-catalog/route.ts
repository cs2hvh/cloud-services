import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * What each partner can actually serve, next to what we already list.
 *
 * The union of both partners' /v1/models, annotated with whether we carry it
 * already and who we route it to. This is how a model gets added to the
 * catalogue without guessing at an upstream id - the id shown here is the
 * exact string the partner answers to.
 *
 * A partner we cannot reach is reported as UNKNOWN, never as empty. An empty
 * list and an unreachable partner look identical in a UI that does not
 * distinguish them, and the difference is "they dropped 300 models" versus
 * "this host has no key". Only one of those is an emergency.
 *
 * Partner names are operator-only and never reach a customer surface.
 */

const TIMEOUT_MS = 8000;

type Partner = {
  name: string;
  baseUrl: string;
  key: string | undefined;
  keyVar: string;
};

function partners(): Partner[] {
  return [
    {
      name: "wokey",
      baseUrl: process.env.WOKEY_BASE_URL || "https://api.wokey.ai/v1",
      key: process.env.WOKEY_PLATFORM_KEY,
      keyVar: "WOKEY_PLATFORM_KEY",
    },
    {
      name: "starimg",
      baseUrl: process.env.STARIMG_BASE_URL || "https://ai.starimg.ru/v1",
      key: process.env.STARIMG_PLATFORM_KEY,
      keyVar: "STARIMG_PLATFORM_KEY",
    },
  ];
}

type PartnerResult = {
  partner: string;
  reachable: boolean;
  unknown: boolean;
  reason: string | null;
  count: number;
  models: { id: string; name: string | null }[];
};

async function fetchPartner(p: Partner): Promise<PartnerResult> {
  const base = {
    partner: p.name,
    reachable: false,
    unknown: false,
    reason: null as string | null,
    count: 0,
    models: [] as { id: string; name: string | null }[],
  };

  if (!p.key) {
    // Not a failure of the partner - a gap in THIS host's environment. Said
    // plainly so nobody reads a missing key as a missing catalogue.
    return {
      ...base,
      unknown: true,
      reason: `${p.keyVar} is not in this host's environment, so the panel cannot ask them what they serve`,
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
    if (!res.ok) {
      return { ...base, unknown: true, reason: `returned ${res.status}` };
    }
    const body = (await res.json()) as {
      data?: { id?: string; name?: string }[];
    };
    if (!Array.isArray(body.data)) {
      return { ...base, unknown: true, reason: "unrecognised response shape" };
    }
    const models = body.data
      .filter((m): m is { id: string; name?: string } => typeof m?.id === "string")
      .map((m) => ({ id: m.id, name: m.name ?? null }));
    return {
      ...base,
      reachable: true,
      count: models.length,
      models,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unreachable";
    return { ...base, unknown: true, reason: msg };
  } finally {
    clearTimeout(timer);
  }
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
    const [results, catalogue] = await Promise.all([
      Promise.all(partners().map(fetchPartner)),
      (async () => {
        const supabase = await createServiceClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inference = (supabase as any).schema("inference");
        const { data, error } = await inference
          .from("models")
          .select("model_id, upstream_model_id, upstream_provider, is_active");
        if (error) throw new Error(error.message);
        return (data ?? []) as {
          model_id: string;
          upstream_model_id: string | null;
          upstream_provider: string | null;
          is_active: boolean;
        }[];
      })(),
    ]);

    // Index what we already carry, by the name we send upstream and by our
    // own id, in raw and bare form - partners namespace inconsistently and a
    // model we already list must not show up as new.
    type Held = { modelId: string; provider: string | null; isActive: boolean };
    const held = new Map<string, Held>();
    for (const row of catalogue) {
      const entry: Held = {
        modelId: row.model_id,
        provider: row.upstream_provider,
        isActive: row.is_active,
      };
      for (const raw of [row.upstream_model_id, row.model_id]) {
        if (!raw) continue;
        for (const form of [raw, raw.toLowerCase(), raw.split("/").pop() ?? raw]) {
          if (!held.has(form)) held.set(form, entry);
        }
      }
    }

    const union = new Map<
      string,
      {
        id: string;
        name: string | null;
        offeredBy: string[];
        inCatalogue: boolean;
        ourModelId: string | null;
        routedTo: string | null;
        isActive: boolean | null;
      }
    >();

    for (const r of results) {
      if (!r.reachable) continue;
      for (const m of r.models) {
        const existing = union.get(m.id);
        if (existing) {
          if (!existing.offeredBy.includes(r.partner)) {
            existing.offeredBy.push(r.partner);
          }
          continue;
        }
        const match =
          held.get(m.id) ??
          held.get(m.id.toLowerCase()) ??
          held.get(m.id.split("/").pop() ?? m.id) ??
          null;
        union.set(m.id, {
          id: m.id,
          name: m.name,
          offeredBy: [r.partner],
          inCatalogue: Boolean(match),
          ourModelId: match?.modelId ?? null,
          routedTo: match?.provider ?? null,
          isActive: match ? match.isActive : null,
        });
      }
    }

    const rows = [...union.values()].sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({
      partners: results.map((r) => ({
        partner: r.partner,
        reachable: r.reachable,
        unknown: r.unknown,
        reason: r.reason,
        count: r.count,
      })),
      summary: {
        union: rows.length,
        onBoth: rows.filter((r) => r.offeredBy.length > 1).length,
        alreadyCarried: rows.filter((r) => r.inCatalogue).length,
        newToUs: rows.filter((r) => !r.inCatalogue).length,
        // A model we route to a partner that no longer offers it is the
        // failure this endpoint is best placed to catch, now that routing is
        // strict and there is no second partner to cover for it.
        routedToPartnerNotOffering: catalogue
          .filter((c) => c.is_active && c.upstream_provider)
          .filter((c) => {
            const r = results.find((x) => x.partner === c.upstream_provider);
            if (!r || !r.reachable) return false;
            const id = c.upstream_model_id ?? c.model_id;
            return !r.models.some(
              (m) =>
                m.id === id ||
                m.id.toLowerCase() === id.toLowerCase() ||
                (m.id.split("/").pop() ?? m.id) === (id.split("/").pop() ?? id),
            );
          })
          .map((c) => ({
            modelId: c.model_id,
            provider: c.upstream_provider,
            upstreamId: c.upstream_model_id,
          })),
      },
      rows,
    });
  } catch (err) {
    console.error("[Admin AI] partner catalog failed:", err);
    return NextResponse.json(
      { error: "Could not build partner catalogue" },
      { status: 500 },
    );
  }
}
