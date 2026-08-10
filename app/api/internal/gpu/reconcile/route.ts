import { NextRequest } from "next/server";

import { RunPodService } from "@/lib/services/runpod-service";
import { authorizeInternalCron } from "@/lib/api/internal-cron-auth";

export const dynamic = "force-dynamic";

const LOCK_TTL_SECONDS = 240;
const LOCK_KEY = "lock:gpu-pod-reconcile";



/**
 * POST /api/internal/gpu/reconcile
 *
 * For every pod whose DB status implies "should be present on RunPod", fetch
 * /pods/{id} and reconcile. Detects spot interruption (404), state drift, and
 * upstream deletions. Closes billing for disappeared pods.
 *
 * Single-flighted via Redis NX lock.
 */
export async function POST(req: NextRequest) {
    if (!authorizeInternalCron(req)) {
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
        const result = await RunPodService.reconcileActivePods();
        if (!result.success) {
            return Response.json(
                { ok: false, error: result.error || "Reconcile failed" },
                { status: 500 }
            );
        }
        return Response.json({ ok: true, summary: result.data });
    } finally {
        try {
            const current = await redis.get(LOCK_KEY);
            if (current === lockToken) await redis.del(LOCK_KEY);
        } catch {
            // ignore
        }
    }
}
