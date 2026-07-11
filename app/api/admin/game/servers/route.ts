import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/supabase/auth";
import { listGameServersAdmin } from "@/lib/services/game/admin";

export const dynamic = "force-dynamic";

// GET /api/admin/game/servers?search=&game=&region=&status=&page=&pageSize=
export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  try {
    const result = await listGameServersAdmin({
      search: sp.get("search") ?? undefined,
      game: sp.get("game") ?? undefined,
      region: sp.get("region") ?? undefined,
      status: sp.get("status") ?? undefined,
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to list servers" }, { status: 500 });
  }
}
