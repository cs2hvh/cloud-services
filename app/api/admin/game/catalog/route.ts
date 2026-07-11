// Admin CRUD for game_catalog (the supported games + their Pterodactyl egg
// wiring). Writes invalidate the customer-facing catalog cache.

import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { invalidateGamePlanCache } from "@/lib/pricing/game-plan-catalog";

export const dynamic = "force-dynamic";

const ID_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

type CatalogPayload = {
  id?: string;
  display_name?: string;
  description?: string | null;
  nest_id?: number | string;
  egg_id?: number | string;
  docker_image?: string;
  startup?: string | null;
  default_environment?: Record<string, unknown>;
  env_schema?: unknown[];
  port_plan?: unknown[];
  credential_field?: string | null;
  min_memory_mb?: number | string;
  min_disk_gb?: number | string;
  requires_eula?: boolean;
  is_active?: boolean;
  sort_order?: number | string;
};

function toRow(p: CatalogPayload): Record<string, unknown> {
  return {
    id: p.id,
    display_name: p.display_name,
    description: p.description ?? null,
    nest_id: Math.round(Number(p.nest_id ?? 0)),
    egg_id: Math.round(Number(p.egg_id ?? 0)),
    docker_image: p.docker_image ?? "",
    startup: p.startup ?? null,
    default_environment: p.default_environment ?? {},
    env_schema: p.env_schema ?? [],
    port_plan: p.port_plan ?? [],
    credential_field: p.credential_field ?? null,
    min_memory_mb: Math.round(Number(p.min_memory_mb ?? 1024)),
    min_disk_gb: Math.round(Number(p.min_disk_gb ?? 5)),
    requires_eula: p.requires_eula === true,
    is_active: p.is_active !== false,
    sort_order: Math.round(Number(p.sort_order ?? 0)),
  };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createServiceClient();
  const { data, error } = await supabase.from("game_catalog").select("*").order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, games: data ?? [] });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as CatalogPayload;
  if (!body.id || !ID_RE.test(body.id)) return NextResponse.json({ error: "id must be lowercase letters/numbers/hyphens" }, { status: 400 });
  if (!body.display_name) return NextResponse.json({ error: "display_name is required" }, { status: 400 });

  const supabase = await createServiceClient();
  const { error } = await supabase.from("game_catalog").insert(toRow(body));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateGamePlanCache();
  return NextResponse.json({ ok: true });
}

export async function PUT(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as CatalogPayload;
  if (!body.id || !ID_RE.test(body.id)) return NextResponse.json({ error: "valid id is required" }, { status: 400 });
  if (!body.display_name) return NextResponse.json({ error: "display_name is required" }, { status: 400 });

  const supabase = await createServiceClient();
  const { id, ...row } = toRow(body);
  void id;
  const { error } = await supabase.from("game_catalog").update(row).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateGamePlanCache();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const supabase = await createServiceClient();
  const { count } = await supabase
    .from("game_servers")
    .select("id", { count: "exact", head: true })
    .eq("game_type", id)
    .neq("status", "terminated");
  if ((count ?? 0) > 0) return NextResponse.json({ error: `${count} live server(s) use this game.` }, { status: 409 });

  const { error } = await supabase.from("game_catalog").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateGamePlanCache();
  return NextResponse.json({ ok: true });
}
