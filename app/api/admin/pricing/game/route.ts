// Admin CRUD for game_server_plans (prepaid monthly). Mirrors the instance-plans
// admin route. All writes invalidate the in-process game-plan cache.
//
//   GET    /api/admin/pricing/game         → list all plans (incl. inactive)
//   POST   /api/admin/pricing/game         → create a plan
//   PUT    /api/admin/pricing/game         → update one (slug in body)
//   DELETE /api/admin/pricing/game?slug=X  → delete (refused if live servers use it)

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { invalidateGamePlanCache } from "@/lib/pricing/game-plan-catalog";

export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

type PlanPayload = {
  slug?: string;
  game_type?: string;
  name?: string;
  tagline?: string | null;
  cpu_pct?: number | string;
  memory_mb?: number | string;
  disk_gb?: number | string;
  swap_mb?: number | string;
  databases?: number | string;
  backups?: number | string;
  extra_allocations?: number | string;
  monthly_price?: number | string;
  allowed_regions?: string[] | null;
  allowed_host_ids?: string[] | null;
  is_active?: boolean;
  sort_order?: number | string;
};

function validate(p: PlanPayload, requireSlug: boolean): string | null {
  if (requireSlug && (!p.slug || !SLUG_RE.test(p.slug))) return "slug is required (lowercase letters/numbers/hyphens, 2-31 chars)";
  if (!p.game_type || typeof p.game_type !== "string") return "game_type is required";
  if (!p.name || typeof p.name !== "string" || p.name.length > 64) return "name is required (≤ 64 chars)";
  if (!(Number(p.memory_mb) > 0)) return "memory_mb must be positive";
  if (!(Number(p.disk_gb) > 0)) return "disk_gb must be positive";
  if (!(Number(p.monthly_price) >= 0)) return "monthly_price must be ≥ 0";
  return null;
}

function toRow(p: PlanPayload): Record<string, unknown> {
  return {
    slug: p.slug,
    game_type: p.game_type,
    name: p.name,
    tagline: p.tagline ?? null,
    cpu_pct: Math.round(Number(p.cpu_pct ?? 100)),
    memory_mb: Math.round(Number(p.memory_mb)),
    disk_gb: Math.round(Number(p.disk_gb)),
    swap_mb: Math.round(Number(p.swap_mb ?? 0)),
    databases: Math.round(Number(p.databases ?? 0)),
    backups: Math.round(Number(p.backups ?? 1)),
    extra_allocations: Math.round(Number(p.extra_allocations ?? 0)),
    monthly_price: Number(p.monthly_price),
    allowed_regions: Array.isArray(p.allowed_regions) && p.allowed_regions.length ? p.allowed_regions : null,
    allowed_host_ids: Array.isArray(p.allowed_host_ids) && p.allowed_host_ids.length ? p.allowed_host_ids : null,
    is_active: p.is_active !== false,
    sort_order: Math.round(Number(p.sort_order ?? 0)),
  };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createServiceClient();
  const { data, error } = await supabase.from("game_server_plans").select("*").order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, plans: data ?? [] });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as PlanPayload;
  const err = validate(body, true);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const supabase = await createServiceClient();
  const { error } = await supabase.from("game_server_plans").insert({ ...toRow(body), updated_by: admin.userId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateGamePlanCache();
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as PlanPayload;
  if (!body.slug || !SLUG_RE.test(body.slug)) return NextResponse.json({ error: "valid slug is required" }, { status: 400 });
  const err = validate(body, false);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const supabase = await createServiceClient();
  const { slug, ...row } = toRow(body);
  void slug;
  const { error } = await supabase
    .from("game_server_plans")
    .update({ ...row, updated_by: admin.userId, updated_at: new Date().toISOString() })
    .eq("slug", body.slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateGamePlanCache();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });

  const supabase = await createServiceClient();
  const { count } = await supabase
    .from("game_servers")
    .select("id", { count: "exact", head: true })
    .eq("plan_slug", slug)
    .neq("status", "terminated");
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: `${count} live server(s) use this plan.` }, { status: 409 });
  }
  const { error } = await supabase.from("game_server_plans").delete().eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateGamePlanCache();
  return NextResponse.json({ ok: true });
}
