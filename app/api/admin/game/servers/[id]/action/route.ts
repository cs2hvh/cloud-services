import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/supabase/auth";
import { getServerRowById, reinstallServerAdmin, changePlanAdmin } from "@/lib/services/game/admin";
import { suspendGameServer, unsuspendGameServer, powerGameServer } from "@/lib/services/game/lifecycle";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["suspend", "unsuspend", "reinstall", "change_plan", "power"]);

// POST /api/admin/game/servers/[id]/action
// body: { action, planSlug?, signal?, reason? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    planSlug?: string;
    signal?: string;
    reason?: string;
  };
  const action = body.action ?? "";
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const row = await getServerRowById(id);
  if (!row || row.status === "terminated") return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    switch (action) {
      case "suspend":
        await suspendGameServer(row, body.reason || `Suspended by admin (${admin.email})`);
        break;
      case "unsuspend":
        await unsuspendGameServer(row);
        break;
      case "reinstall":
        await reinstallServerAdmin(row);
        break;
      case "change_plan":
        if (!body.planSlug) return NextResponse.json({ error: "planSlug required" }, { status: 400 });
        await changePlanAdmin(row, body.planSlug);
        break;
      case "power": {
        const signal = body.signal;
        if (!signal || !["start", "stop", "restart", "kill"].includes(signal)) {
          return NextResponse.json({ error: "invalid signal" }, { status: 400 });
        }
        const res = await powerGameServer(row, signal as "start" | "stop" | "restart" | "kill");
        if (!res.ok) return NextResponse.json({ error: res.error }, { status: 422 });
        break;
      }
    }
    return NextResponse.json({ ok: true, action });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Action failed" }, { status: 500 });
  }
}
