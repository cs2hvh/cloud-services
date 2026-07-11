import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/services/game/servers — the caller's game servers (RLS-scoped).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("game_servers")
    .select(
      "id, name, game_type, status, plan_slug, region, ip, port, monthly_price, auto_renew, ends_at, grace_until, suspended_at, details, created_at",
    )
    .neq("status", "terminated")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, servers: data ?? [] });
}
