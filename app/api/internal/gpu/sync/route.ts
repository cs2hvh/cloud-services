import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

import { RunPodService } from "@/lib/services/runpod-service";

export const dynamic = "force-dynamic";

const LOCK_TTL_SECONDS = 120;
const LOCK_KEY = "lock:gpu-inventory-sync";

function getCronSecret(): string {
    const s = process.env.CRON_SECRET;
    if (!s) throw new Error("CRON_SECRET is not configured");
    return s;
}

/**
 * Constant-time compare of `Authorization: Bearer <secret>` against the
 * CRON_SECRET env var. Matches the convention used by the existing
 * domain-contact-sync and domain-transfer-poll cron endpoints.
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
 * POST /api/internal/gpu/sync
 *
 * Triggers a single inventory sync against RunPod GraphQL.
 * Called by the credit-system-cron worker on a tight (~45 s) interval.
 *
 * Single-flighted across instances via a Redis NX lock so two workers can't
 * double-poll RunPod at the same moment.
 */
export async function POST(req: NextRequest) {
    if (!authorize(req)) {
        return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Lazy-load redis so unit tests can run without it.
    const { redis } = await import("@/lib/redis");
    const lockToken = `sync-${Date.now()}`;
    const locked = await redis.set(LOCK_KEY, lockToken, {
        nx: true,
        ex: LOCK_TTL_SECONDS,
    });
    if (!locked) {
        return Response.json(
            { ok: true, skipped: true, reason: "sync already in progress" },
            { status: 200 }
        );
    }

    try {
        const result = await RunPodService.syncSnapshots();
        if (!result.success) {
            return Response.json(
                { ok: false, error: result.error || "Sync failed" },
                { status: 500 }
            );
        }
        return Response.json({ ok: true, summary: result.data });
    } finally {
        // Best-effort release.
        try {
            const current = await redis.get(LOCK_KEY);
            if (current === lockToken) await redis.del(LOCK_KEY);
        } catch {
            // ignore
        }
    }
}
