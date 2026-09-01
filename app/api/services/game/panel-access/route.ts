import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getPanelAccess, resetPanelPassword } from "@/lib/services/game/panel-users";

export const dynamic = "force-dynamic";

// GET /api/services/game/panel-access — panel URL + username + stored password
// for the dashboard "Panel access" card. 404 until the first server is ordered.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const access = await getPanelAccess(user.id);
  if (!access) {
    return NextResponse.json({ ok: false, error: "No panel account yet — order a game server first." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, access });
}

// POST /api/services/game/panel-access — rotate the panel password.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const rate = await limitByUser(user.id, { prefix: "rl:game-panel-reset", limit: 3, windowMs: 60 * 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ ok: false, error: "Too many resets — try again later.", retryAfterSec: rate.retryAfterSec }, { status: 429 });
  }

  try {
    const access = await resetPanelPassword(user.id);
    return NextResponse.json({ ok: true, access });
  } catch (e) {
    console.error("[game/panel-access] reset failed:", e);
    return NextResponse.json(
      { ok: false, error: "Could not reset panel access. Please try again, or contact support if this continues." },
      { status: 400 },
    );
  }
}
