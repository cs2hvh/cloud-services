import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { loadCatalogPlans } from "@admin/lib/catalog";

export const dynamic = "force-dynamic";

/**
 * Legacy plans endpoint, reshaped onto reality: public.products is dropped,
 * so GET serves service_plans + the live price book through the same
 * product-shaped rows the section components expect. Writes are refused with
 * a pointer — the price book (/pricing, billing.set_price) is the single
 * write surface; recreating a products write path here would fork pricing
 * again.
 */

const TYPE_MAP: Record<string, string> = {
  database: "database",
  kubernetes: "kubernetes",
  "object-storage": "objectspace",
  object_storage: "objectspace",
  objectspace: "objectspace",
  "network-ddos": "spectrum",
  network_ddos: "spectrum",
  spectrum: "spectrum",
};

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const rawType = (searchParams.get("type") ?? "").trim();
  const serviceType = TYPE_MAP[rawType];
  if (!serviceType) {
    return NextResponse.json(
      { error: `Unknown plan type "${rawType}"` },
      { status: 400 },
    );
  }

  const catalog = await loadCatalogPlans(serviceType);
  if (catalog.error) {
    return NextResponse.json({ error: catalog.error }, { status: 500 });
  }
  return NextResponse.json({ data: catalog.plans });
}

const gone = () =>
  NextResponse.json(
    {
      error:
        "Plan writes moved to the price book: catalog rows live in public.service_plans (billing lane's schema), prices are set on /pricing via billing.set_price(). public.products no longer exists.",
    },
    { status: 410 },
  );

export async function POST() {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  return gone();
}
export async function PUT() {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  return gone();
}
export async function DELETE() {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  return gone();
}
