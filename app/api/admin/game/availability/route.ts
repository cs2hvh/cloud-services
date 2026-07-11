import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/supabase/auth";
import { getGameDeployEnabled, setGameDeployEnabled } from "@/lib/admin/platform-settings";

export const dynamic = "force-dynamic";

// GET — current game-server ordering availability (admin only).
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, enabled: await getGameDeployEnabled() });
}

// POST { enabled: boolean } — flip the game-server ordering switch (admin only).
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { enabled?: unknown };
  const enabled = body.enabled === true;
  await setGameDeployEnabled(enabled, admin.userId);
  return NextResponse.json({ ok: true, enabled });
}
