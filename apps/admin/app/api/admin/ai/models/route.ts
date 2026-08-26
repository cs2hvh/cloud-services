import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

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
    const [{ data, error }, upstreamIds] = await Promise.all([
      (supabase as any)
        .schema("inference")
        .from("models")
        .select(
          "id, model_id, display_name, modality, serving_type, upstream_model_id, org_id, pricing, upstream_pricing, is_active, is_featured, sort_order, created_at",
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orphaned = rows.filter(
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
