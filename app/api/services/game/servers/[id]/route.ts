import { NextResponse } from "next/server";
import { GENERIC_SERVICE_ERROR, logError } from "@/lib/api/error-sanitizer";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { limitByUser } from "@/lib/cooldown/userbased";
import { deleteGameServer, getOwnedServer } from "@/lib/services/game/lifecycle";
import { reconcileInstallingGameServers } from "@/lib/services/game/provisioning";

export const dynamic = "force-dynamic";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET /api/services/game/servers/[id] — detail + recent events.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  let server = await getOwnedServer(id, user.id);
  if (!server || server.status === "terminated") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // Opportunistic install reconcile: while a server is in-flight, each detail
  // view checks the panel (slow installs like CS2 outlive the create-time poll).
  if (server.status === "provisioning" || server.status === "installing") {
    try {
      const { completed } = await reconcileInstallingGameServers(id);
      if (completed > 0) server = (await getOwnedServer(id, user.id)) ?? server;
    } catch (e) {
      // Best-effort — the cron sweep retries — but not silent: an unreadable
      // catalog or panel must leave a trace, not just a server that stays
      // "installing" with nothing in the logs.
      console.warn(`[game-server-route] opportunistic reconcile for server ${id} failed:`, e instanceof Error ? e.message : e);
    }
  }

  const service = await createServiceClient();
  const { data: events } = await service
    .from("game_server_events")
    .select("event_type, message, created_at")
    .eq("server_id", id)
    .order("created_at", { ascending: false })
    .limit(25);

  // Never expose env_blob or panel internals here.
  return NextResponse.json({
    ok: true,
    server: {
      id: server.id,
      name: server.name,
      gameType: server.game_type,
      status: server.status,
      planSlug: server.plan_slug,
      region: server.region,
      ip: server.ip,
      port: server.port,
      identifier: server.identifier,
      monthlyPrice: server.monthly_price,
      autoRenew: server.auto_renew,
      endsAt: server.ends_at,
      graceUntil: server.grace_until,
      suspendedAt: server.suspended_at,
      details: server.details,
    },
    events: events ?? [],
  });
}

// PATCH /api/services/game/servers/[id] — rename / toggle auto-renew.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const rate = await limitByUser(user.id, { prefix: "rl:game-update", limit: 20, windowMs: 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ ok: false, error: "Too many requests", retryAfterSec: rate.retryAfterSec }, { status: 429 });
  }

  const server = await getOwnedServer(id, user.id);
  if (!server || server.status === "terminated") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { name?: unknown; autoRenew?: unknown };
  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !/^[\w\d .-]{3,48}$/.test(body.name.trim())) {
      return NextResponse.json({ ok: false, error: "Invalid name" }, { status: 400 });
    }
    patch.name = body.name.trim();
  }
  if (body.autoRenew !== undefined) {
    patch.auto_renew = body.autoRenew === true;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  const service = await createServiceClient();
  const { error } = await service.from("game_servers").update(patch).eq("id", id);
  if (error) {
    // Postgres error text names tables, columns and constraints.
    logError("PATCH /api/services/game/servers/[id]", error);
    return NextResponse.json({ ok: false, error: GENERIC_SERVICE_ERROR }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/services/game/servers/[id] — terminate (prepaid: no auto refund).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const rate = await limitByUser(user.id, { prefix: "rl:game-delete", limit: 10, windowMs: 60 * 60_000 });
  if (!rate.allowed) {
    return NextResponse.json({ ok: false, error: "Too many requests", retryAfterSec: rate.retryAfterSec }, { status: 429 });
  }

  const server = await getOwnedServer(id, user.id);
  if (!server || server.status === "terminated") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const result = await deleteGameServer({
    server,
    reason: "Deleted by owner",
    notifyEmail: user.email ?? null,
  });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });

  return NextResponse.json({ ok: true });
}
