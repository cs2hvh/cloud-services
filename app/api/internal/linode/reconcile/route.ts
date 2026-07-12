import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

import { reconcileLinodeInstances } from "@/lib/services/linode/reconcile";

export const dynamic = "force-dynamic";

const LOCK_TTL_SECONDS = 120;
const LOCK_KEY = "lock:linode-reconcile";

function getCronSecret(): string {
    const s = process.env.CRON_SECRET;
    if (!s) throw new Error("CRON_SECRET is not configured");
    return s;
}

/**
 * Constant-time compare of `Authorization: Bearer <secret>` against the
 * CRON_SECRET env var. Matches the convention used by the existing
 * internal linode/gpu/domain sync endpoints.
 */
function authorize(req: NextRequest): boolean {
    const header = req.headers.get("authorization") || "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return false;
    const provided = match[1];
    let expected: string;
    try {
        expected = getCronSecret();
    } catch {
        return false;
    }
    if (provided.length === 0 || provided.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

/**
 * POST /api/internal/linode/reconcile
 *
 * Compares the live Linode account against the servers table: reports
 * untracked panel instances (never auto-deleted) and flags + stops billing
 * on rows whose instance is gone upstream. Intended to be hit by an
 * external cron roughly every 6 hours.
 *
 * Single-flighted across instances via a Redis NX lock.
 */
export async function POST(req: NextRequest) {
    if (!authorize(req)) {
        return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { redis } = await import("@/lib/redis");
    const lockToken = `reconcile-${Date.now()}`;
    const locked = await redis.set(LOCK_KEY, lockToken, {
        nx: true,
        ex: LOCK_TTL_SECONDS,
    });
    if (!locked) {
        return Response.json(
            { ok: true, skipped: true, reason: "reconcile already in progress" },
            { status: 200 }
        );
    }

    try {
        const report = await reconcileLinodeInstances();
        return Response.json({ ok: true, summary: report });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Reconcile failed";
        return Response.json({ ok: false, error: message }, { status: 500 });
    } finally {
        try {
            const current = await redis.get(LOCK_KEY);
            if (current === lockToken) await redis.del(LOCK_KEY);
        } catch {
            // ignore
        }
    }
}
