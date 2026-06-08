import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

import { RunPodService } from "@/lib/services/runpod-service";

export const dynamic = "force-dynamic";

const LOCK_TTL_SECONDS = 240;
const LOCK_KEY = "lock:gpu-pod-reconcile";

function getCronSecret(): string {
    const s = process.env.CRON_SECRET;
    if (!s) throw new Error("CRON_SECRET is not configured");
    return s;
}

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
 * POST /api/internal/gpu/reconcile
 *
 * Reconciles pods and network volumes, including failed create cleanup,
 * provider-side deletion, state drift, billing closure, and attachment release.
 *
 * Single-flighted via Redis NX lock.
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
        const [pods, volumes] = await Promise.all([
            RunPodService.reconcileActivePods(),
            RunPodService.reconcileVolumes(),
        ]);
        if (!pods.success || !volumes.success) {
            return Response.json(
                {
                    ok: false,
                    error:
                        pods.error ||
                        volumes.error ||
                        "GPU resource reconciliation failed",
                },
                { status: 500 }
            );
        }
        return Response.json({
            ok: true,
            summary: {
                pods: pods.data,
                volumes: volumes.data,
            },
        });
    } finally {
        try {
            const current = await redis.get(LOCK_KEY);
            if (current === lockToken) await redis.del(LOCK_KEY);
        } catch {
            // ignore
        }
    }
}
