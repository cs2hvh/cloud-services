// Admin: Linode images — list every synced public image (including inactive
// and deprecated) and flip the admin is_active switch.
//
// GET   → { ok, images: [...] }
// PATCH { id, is_active } → { ok, image }

import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { invalidateLinodeCatalogCache } from "@/lib/pricing/linode-catalog";
import { AuditLogService } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
    const admin = await requireAdmin();
    if (!admin.ok) {
        return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createServiceClient();
    const { data, error } = await supabase
        .from("linode_images")
        .select("id, label, vendor, size_mb, is_public, deprecated, eol, is_active, synced_at")
        .order("vendor")
        .order("label");

    if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    const images = (data ?? []).map((i) => ({
        id: i.id as string,
        label: i.label as string,
        vendor: (i.vendor as string | null) ?? null,
        size_mb: Number(i.size_mb ?? 0),
        is_public: Boolean(i.is_public),
        deprecated: Boolean(i.deprecated),
        eol: (i.eol as string | null) ?? null,
        is_active: Boolean(i.is_active),
        synced_at: (i.synced_at as string) ?? null,
    }));

    return Response.json({ ok: true, images });
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
        .from("linode_images")
        .update({ is_active: body.is_active })
        .eq("id", id)
        .select("id, label, is_active")
        .maybeSingle();

    if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) {
        return Response.json({ ok: false, error: `Image ${id} not found` }, { status: 404 });
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
            service_name: `Linode image ${(data.label as string) ?? id}`,
            metadata: { operation: "admin.linode.image.update", id, is_active: body.is_active },
            user_agent: req.headers.get("user-agent") || undefined,
        });
    } catch {
        // audit must never fail the mutation
    }

    return Response.json({ ok: true, image: data });
}
