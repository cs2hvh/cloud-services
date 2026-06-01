// Keep-alive inventory sync. Any authenticated user can call this; the work
// itself runs at most once every SYNC_LOCK_TTL_SECONDS globally thanks to a
// Redis NX lock, so spammy concurrent calls (10 tabs, 100 users, fast polling)
// all coalesce into one RunPod GraphQL roundtrip per window.
//
// Pattern:
//   - Browser pings this every ~6s while the GPU page is visible.
//   - First hit in a window does the work and returns ran=true.
//   - Subsequent hits short-circuit and return ran=false, queued=true.
//   - Either way, the snapshot row written by the worker triggers a Supabase
//     realtime update that re-renders the client UI.

import { NextRequest } from "next/server";

import { limitByUser } from "@/lib/cooldown/userbased";
import { RunPodService } from "@/lib/services/runpod-service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SYNC_LOCK_KEY = "lock:gpu-inventory-sync";
const SYNC_LOCK_TTL_SECONDS = 6;

export async function POST(_req: NextRequest) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return Response.json(
            { ok: false, error: "Authentication required" },
            { status: 401 }
        );
    }

    // Defense-in-depth — even with the NX lock, cap per-user calls.
    const rl = await limitByUser(user.id, {
        prefix: "rl:gpu-sync",
        limit: 60,
        windowMs: 60_000,
    });
    if (!rl.allowed) {
        return Response.json(
            { ok: false, error: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec },
            { status: 429 }
        );
    }

    const { redis } = await import("@/lib/redis");
    const lockToken = `sync-${Date.now()}-${user.id}`;
    const locked = await redis.set(SYNC_LOCK_KEY, lockToken, {
        nx: true,
        ex: SYNC_LOCK_TTL_SECONDS,
    });

    // Lock held by another caller — that caller will write fresh snapshots
    // within the next few seconds. Realtime will push the result to all clients.
    if (!locked) {
        return Response.json({ ok: true, ran: false, queued: true });
    }

    try {
        const result = await RunPodService.syncSnapshots();
        if (!result.success) {
            return Response.json(
                { ok: false, error: result.error || "Sync failed" },
                { status: 500 }
            );
        }
        return Response.json({ ok: true, ran: true, summary: result.data });
    } finally {
        try {
            const current = await redis.get(SYNC_LOCK_KEY);
            if (current === lockToken) await redis.del(SYNC_LOCK_KEY);
        } catch {
            // ignore
        }
    }
}
