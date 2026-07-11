import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

import { runRenewalSweep } from "@/lib/services/game/renewals";
import { reconcileInstallingGameServers } from "@/lib/services/game/provisioning";

export const dynamic = "force-dynamic";

const LOCK_KEY = "lock:game-renewal-sweep";
const LOCK_TTL_SECONDS = 240;

function authorize(req: NextRequest): boolean {
  const header = req.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  const provided = match[1];
  const expected = process.env.CRON_SECRET;
  if (!expected || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/**
 * POST /api/internal/game/renewals — prepaid-monthly renewal sweep.
 * Renews auto-renew servers near expiry, suspends unpaid expired servers
 * (3-day grace), recovers suspended servers once funded, deletes after grace.
 * Run every 15-60 minutes. Single-flighted via Redis NX lock.
 */
export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { redis } = await import("@/lib/redis");
  const locked = await redis.set(LOCK_KEY, `sweep-${Date.now()}`, { nx: true, ex: LOCK_TTL_SECONDS });
  if (!locked) {
    return Response.json({ ok: true, skipped: true, reason: "sweep already in progress" });
  }

  try {
    const summary = await runRenewalSweep();
    const installs = await reconcileInstallingGameServers().catch((e) => {
      console.warn("[game-renewals-route] install reconcile failed:", e instanceof Error ? e.message : e);
      return null;
    });
    return Response.json({ ok: true, summary, installs });
  } catch (e) {
    console.error("[game-renewals-route] sweep failed:", e);
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "sweep failed" }, { status: 500 });
  } finally {
    await redis.del(LOCK_KEY).catch(() => {});
  }
}
