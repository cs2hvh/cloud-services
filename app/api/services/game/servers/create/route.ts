import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { limitByUser } from "@/lib/cooldown/userbased";
import { checkIdempotency, getIdempotencyKey } from "@/lib/idempotency";
import { getGameDeployEnabled } from "@/lib/admin/platform-settings";
import { createGameServer } from "@/lib/services/game/provisioning";

export const dynamic = "force-dynamic";

const MAX_SERVERS_PER_USER = 10;

// POST /api/services/game/servers/create — order a prepaid-monthly game server.
// Body: { name, gameType, planSlug, region, projectId?, environment?, eulaAccepted? }
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!(await getGameDeployEnabled())) {
    return NextResponse.json(
      { ok: false, error: "Game server deployments are temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }

  const rate = await limitByUser(user.id, { prefix: "rl:game-create", limit: 5, windowMs: 5 * 60_000 });
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many orders — slow down a little.", retryAfterSec: rate.retryAfterSec },
      { status: 429 },
    );
  }

  // Idempotency (protects against double-click double-charges).
  const idemKey = getIdempotencyKey(req.headers);
  let idem: Awaited<ReturnType<typeof checkIdempotency>> | null = null;
  if (idemKey) {
    idem = await checkIdempotency(`game-create:${user.id}:${idemKey}`);
    if (idem.status === "completed") {
      return NextResponse.json(idem.data, { status: 200 });
    }
    if (idem.status === "in-progress") {
      return NextResponse.json(
        { ok: false, error: "This order is already being processed.", retryAfterSec: idem.retryAfter },
        { status: 409 },
      );
    }
    if (!(await idem.reserve())) {
      return NextResponse.json({ ok: false, error: "This order is already being processed." }, { status: 409 });
    }
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      name?: unknown;
      gameType?: unknown;
      planSlug?: unknown;
      region?: unknown;
      projectId?: unknown;
      environment?: unknown;
      eulaAccepted?: unknown;
    };

    if (typeof body.name !== "string" || typeof body.gameType !== "string" || typeof body.planSlug !== "string" || typeof body.region !== "string") {
      const res = { ok: false, error: "name, gameType, planSlug and region are required" };
      if (idem?.status === "new") await idem.abort();
      return NextResponse.json(res, { status: 400 });
    }

    const environment: Record<string, string> = {};
    if (body.environment && typeof body.environment === "object") {
      for (const [k, v] of Object.entries(body.environment as Record<string, unknown>)) {
        if (typeof v === "string" && /^[A-Z][A-Z0-9_]{1,40}$/.test(k)) environment[k] = v;
      }
    }

    // Per-user cap (count non-terminated).
    const { count } = await supabase
      .from("game_servers")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .neq("status", "terminated");
    if ((count ?? 0) >= MAX_SERVERS_PER_USER) {
      const res = { ok: false, error: `Limit reached: max ${MAX_SERVERS_PER_USER} game servers per account.` };
      if (idem?.status === "new") await idem.abort();
      return NextResponse.json(res, { status: 429 });
    }

    const result = await createGameServer({
      userId: user.id,
      userEmail: user.email,
      userName: (user.user_metadata as { full_name?: string } | null)?.full_name ?? null,
      name: body.name,
      gameType: body.gameType,
      planSlug: body.planSlug,
      region: body.region,
      projectId: typeof body.projectId === "string" ? body.projectId : null,
      environment,
      eulaAccepted: body.eulaAccepted === true,
    });

    if (!result.ok) {
      const status =
        result.error.code === "INSUFFICIENT_FUNDS" ? 402 :
        result.error.code === "NO_CAPACITY" ? 409 :
        result.error.code === "GAME_UNAVAILABLE" ? 404 :
        result.error.code === "INVALID" ? 400 : 500;
      if (idem?.status === "new") await idem.abort();
      return NextResponse.json({ ok: false, error: result.error.message, code: result.error.code }, { status });
    }

    const response = { ok: true, serverId: result.serverId, status: result.status };
    if (idem?.status === "new") await idem.complete(response);
    return NextResponse.json(response, { status: 202 });
  } catch (err) {
    if (idem?.status === "new") await idem.abort();
    console.error("[game-create-route] unexpected error:", err);
    return NextResponse.json({ ok: false, error: "Internal error" }, { status: 500 });
  }
}
