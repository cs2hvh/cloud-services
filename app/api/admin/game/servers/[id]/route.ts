import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getGameServerAdmin, getServerRowById, extendExpiryAdmin } from "@/lib/services/game/admin";
import { deleteGameServer } from "@/lib/services/game/lifecycle";

export const dynamic = "force-dynamic";

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET — full server detail + events (admin).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const result = await getGameServerAdmin(id);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...result });
}

// PATCH — admin edits: extend expiry (days), rename, toggle auto_renew.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { extendDays?: unknown; name?: unknown; autoRenew?: unknown };

  if (typeof body.extendDays === "number" && body.extendDays > 0) {
    await extendExpiryAdmin(id, Math.min(365, Math.floor(body.extendDays)));
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && /^[\w\d .-]{3,48}$/.test(body.name.trim())) patch.name = body.name.trim();
  if (body.autoRenew !== undefined) patch.auto_renew = body.autoRenew === true;
  if (Object.keys(patch).length) {
    const supabase = await createServiceClient();
    await supabase.from("game_servers").update(patch).eq("id", id);
  }

  return NextResponse.json({ ok: true });
}

// DELETE — terminate (admin; forfeit remaining prepaid period).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const row = await getServerRowById(id);
  if (!row || row.status === "terminated") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await deleteGameServer({ server: row, reason: `Deleted by admin (${admin.email})` });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
