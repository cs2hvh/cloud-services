// Admin-triggered Linode catalog sync. Same handler as the cron version
// (/api/internal/linode/sync) but gated on requireAdmin() instead of
// CRON_SECRET so authorized users can force a refresh from the dashboard
// without distributing the cron token.

import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/supabase/auth";
import { syncLinodeCatalog } from "@/lib/services/linode/catalog-sync";
import { AuditLogService } from "@/lib/audit";

export const dynamic = "force-dynamic";

const LOCK_TTL_SECONDS = 120;
const LOCK_KEY = "lock:linode-catalog-sync";

export async function POST(req: NextRequest) {
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
        const report = await syncLinodeCatalog();

        // Best-effort audit trail — a sync mutates the sellable catalog.
        try {
            await AuditLogService.create({
                user_id: admin.userId || "",
                user_email: admin.email,
                user_role: "admin",
                action: "update",
                service_type: "compute",
                service_id: "linode-catalog",
                service_name: "Linode catalog",
                metadata: { operation: "admin.linode.sync", ...report },
                user_agent: req.headers.get("user-agent") || undefined,
            });
        } catch {
            // audit must never fail the sync
        }

        return Response.json({ ok: true, summary: report });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Sync failed";
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
