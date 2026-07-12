// Admin: Linode regions — list every synced region (including inactive) with
// per-region plan-availability counts, and flip the admin is_active switch.
//
// GET   → { ok, regions: [...] }
// PATCH { id, is_active } → { ok, region }

import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
    invalidateLinodeCatalogCache,
    selectAllAvailabilityRows,
} from "@/lib/pricing/linode-catalog";
import { AuditLogService } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
    const admin = await requireAdmin();
    if (!admin.ok) {
        return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createServiceClient();
    const [regionsRes, availRes] = await Promise.all([
        supabase
            .from("linode_regions")
            .select("id, label, country, capabilities, status, is_active, synced_at")
            .order("label"),
        // Paginated read — the table exceeds PostgREST's ~1000-row cap.
        selectAllAvailabilityRows(supabase),
    ]);

    if (regionsRes.error) {
        return Response.json({ ok: false, error: regionsRes.error.message }, { status: 500 });
    }

    // n available plans / total plans reported for each region.
    const counts = new Map<string, { available: number; total: number }>();
    for (const row of availRes.rows) {
        const key = row.region_id;
        const entry = counts.get(key) ?? { available: 0, total: 0 };
        entry.total += 1;
        if (row.available) entry.available += 1;
        counts.set(key, entry);
    }

    const regions = (regionsRes.data ?? []).map((r) => ({
        id: r.id as string,
        label: r.label as string,
        country: r.country as string,
        capabilities: (r.capabilities as string[]) ?? [],
        status: r.status as string,
        is_active: Boolean(r.is_active),
        synced_at: (r.synced_at as string) ?? null,
        available_types: counts.get(r.id as string)?.available ?? 0,
        total_types: counts.get(r.id as string)?.total ?? 0,
    }));

    return Response.json({ ok: true, regions });
}

export async function PATCH(req: NextRequest) {
    const admin = await requireAdmin();
    if (!admin.ok) {
        return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as { id?: unknown; is_active?: unknown };
    const id = typeof body.id === "string" ? body.id : "";
    if (!id || typeof body.is_active !== "boolean") {
        return Response.json(
            { ok: false, error: "id (string) and is_active (boolean) are required" },
            { status: 400 }
        );
    }

    const supabase = await createServiceClient();
    const { data, error } = await supabase
        .from("linode_regions")
        .update({ is_active: body.is_active })
        .eq("id", id)
        .select("id, label, is_active")
        .maybeSingle();

    if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) {
        return Response.json({ ok: false, error: `Region ${id} not found` }, { status: 404 });
    }

    invalidateLinodeCatalogCache();

    try {
        await AuditLogService.create({
            user_id: admin.userId || "",
            user_email: admin.email,
            user_role: "admin",
            action: "update",
            service_type: "compute",
            service_id: id,
            service_name: `Linode region ${(data.label as string) ?? id}`,
            metadata: { operation: "admin.linode.region.update", id, is_active: body.is_active },
            user_agent: req.headers.get("user-agent") || undefined,
        });
    } catch {
        // audit must never fail the mutation
    }

    return Response.json({ ok: true, region: data });
}
