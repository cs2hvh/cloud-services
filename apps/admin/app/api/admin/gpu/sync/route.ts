// Admin-triggered GPU inventory sync. Same handler as the cron version
// (/api/internal/gpu/sync) but gated on requireAdmin() instead of CRON_SECRET
// so authorized users can force a refresh from the dashboard without
// distributing the cron token.

import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/supabase/auth";
import { RunPodService } from "@/lib/services/runpod-service";

export const dynamic = "force-dynamic";

const LOCK_TTL_SECONDS = 120;
const LOCK_KEY = "lock:gpu-inventory-sync";

export async function POST(_req: NextRequest) {
    const admin = await requireAdmin();
    if (!admin.ok) {
        return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

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
        try {
            const current = await redis.get(LOCK_KEY);
            if (current === lockToken) await redis.del(LOCK_KEY);
        } catch {
            // ignore
        }
    }
}
