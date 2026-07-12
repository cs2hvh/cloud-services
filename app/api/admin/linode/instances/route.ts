// Admin: Linode-backed servers — every servers row with provider='linode',
// joined (in JS — plan_slug is 'linode:<type>') with the type's current list
// price so the UI can show per-instance margin. Read-only.
//
// GET → { ok, instances: [...], total }

import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PLAN_PREFIX = "linode:";

function typeIdFromPlanSlug(planSlug: string | null): string | null {
    if (!planSlug) return null;
    return planSlug.startsWith(PLAN_PREFIX) ? planSlug.slice(PLAN_PREFIX.length) : planSlug;
}

export async function GET() {
    const admin = await requireAdmin();
    if (!admin.ok) {
        return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createServiceClient();
    const [serversRes, typesRes] = await Promise.all([
        supabase
            .from("servers")
            .select(
                "id, name, owner_email, linode_id, location, plan_slug, status, hourly_cost, created_at"
            )
            .eq("provider", "linode")
            .order("created_at", { ascending: false }),
        supabase.from("linode_types").select("id, label, hourly_usd"),
    ]);

    if (serversRes.error) {
        return Response.json({ ok: false, error: serversRes.error.message }, { status: 500 });
    }

    const typeById = new Map(
        (typesRes.data ?? []).map((t) => [
            t.id as string,
            { label: t.label as string, hourly_usd: Number(t.hourly_usd) },
        ])
    );

    const instances = (serversRes.data ?? []).map((s) => {
        const typeId = typeIdFromPlanSlug((s.plan_slug as string | null) ?? null);
        const type = typeId ? typeById.get(typeId) : undefined;
        return {
            id: s.id as number,
            name: s.name as string,
            owner_email: (s.owner_email as string | null) ?? null,
            linode_id: (s.linode_id as number | null) ?? null,
            location: (s.location as string | null) ?? null,
            plan_slug: (s.plan_slug as string | null) ?? null,
            type_id: typeId,
            type_label: type?.label ?? null,
            status: (s.status as string | null) ?? null,
            hourly_cost: s.hourly_cost === null ? null : Number(s.hourly_cost),
            linode_hourly_usd: type?.hourly_usd ?? null,
            created_at: (s.created_at as string) ?? null,
        };
    });

    return Response.json({ ok: true, instances, total: instances.length });
}
