import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
    const { data, error } = await (supabase as any)
      .schema("inference")
      .from("models")
      .select(
        "id, model_id, display_name, modality, serving_type, upstream_model_id, org_id, pricing, upstream_pricing, is_active, is_featured, sort_order, created_at",
      )
      .order("sort_order", { ascending: true })
      .order("model_id", { ascending: true });

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

    const rows = (data ?? []).map((m) => {
      const pricing = (m.pricing ?? null) as Pricing;
      const upstream = (m.upstream_pricing ?? null) as Pricing;
      return {
        ...m,
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

    return NextResponse.json({ data: rows });
  } catch (err) {
    console.error("[Admin AI] models unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
