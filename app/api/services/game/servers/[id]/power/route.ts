import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOwnedServer, powerGameServer } from "@/lib/services/game/lifecycle";

export const dynamic = "force-dynamic";

const SIGNALS = new Set(["start", "stop", "restart", "kill"]);

// POST /api/services/game/servers/[id]/power — { signal: start|stop|restart|kill }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  }

  const rate = await limitByUser(user.id, { prefix: "rl:game-power", limit: 20, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ ok: false, error: "Too many requests", retryAfterSec: rate.retryAfterSec }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { signal?: unknown };
  const signal = typeof body.signal === "string" ? body.signal.toLowerCase() : "";
  if (!SIGNALS.has(signal)) {
    return NextResponse.json({ ok: false, error: "signal must be start|stop|restart|kill" }, { status: 400 });
  }

  const server = await getOwnedServer(id, user.id);
  if (!server || server.status === "terminated") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const result = await powerGameServer(server, signal as "start" | "stop" | "restart" | "kill");
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 });

  return NextResponse.json({ ok: true, signal });
}
