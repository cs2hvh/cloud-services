// Admin CRUD for the instance_plans catalog.
//
//   GET    /api/admin/pricing/plans            → list every plan (incl. inactive)
//   POST   /api/admin/pricing/plans            → create a new plan
//                                                 body: full plan shape
//   PUT    /api/admin/pricing/plans            → update one (slug in body) — all editable fields
//   DELETE /api/admin/pricing/plans?slug=X     → delete a plan
//                                                 Refused if ≥1 active server still references it.
//
// All writes invalidate the in-process plan cache so customer-facing
// reads see the new values on their next request.

import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/supabase/auth";
import { createWorkerClient, createClient } from "@/lib/supabase/server";
import { invalidatePlanCache } from "@/lib/pricing/plan-catalog";

export const dynamic = "force-dynamic";

// ─── Validation ──────────────────────────────────────────────────
type PlanPayload = {
    slug?: string;
    name?: string;
    tier?: string;
    vcpu?: number | string;
    memory_mb?: number | string;
    disk_gb?: number | string;
    hourly_usd?: number | string;
    monthly_usd?: number | string;
    tagline?: string | null;
    is_active?: boolean;
    sort_order?: number | string;
    allowed_regions?: string[] | null;
    allowed_host_ids?: string[] | null;
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

function validatePlan(p: PlanPayload, opts: { requireSlug: boolean }): string | null {
    if (opts.requireSlug && (!p.slug || !SLUG_RE.test(p.slug))) {
        return "slug is required (lowercase, letters/numbers/hyphens, 2-31 chars)";
    }
    if (!p.name || typeof p.name !== "string" || p.name.length > 64) {
        return "name is required (≤ 64 chars)";
    }
    if (p.tier !== "shared" && p.tier !== "dedicated") {
        return "tier must be 'shared' or 'dedicated'";
    }
    const vcpu = Number(p.vcpu);
    if (!Number.isInteger(vcpu) || vcpu < 1 || vcpu > 256) return "vcpu must be 1-256";
    const memMB = Number(p.memory_mb);
    if (!Number.isInteger(memMB) || memMB < 256 || memMB > 2_097_152) {
        return "memory_mb must be 256-2,097,152 (256 MB to 2 TB)";
    }
    const diskGB = Number(p.disk_gb);
    if (!Number.isInteger(diskGB) || diskGB < 10 || diskGB > 100_000) {
        return "disk_gb must be 10-100,000";
    }
    const hourly = Number(p.hourly_usd);
    if (!Number.isFinite(hourly) || hourly < 0 || hourly > 10_000) return "hourly_usd must be 0-10000";
    const monthly = Number(p.monthly_usd);
    if (!Number.isFinite(monthly) || monthly < 0 || monthly > 1_000_000) return "monthly_usd must be 0-1,000,000";
    if (p.tagline !== undefined && p.tagline !== null && typeof p.tagline !== "string") {
        return "tagline must be a string";
    }
    if (p.tagline && p.tagline.length > 120) return "tagline too long (max 120 chars)";
    if (p.allowed_regions !== undefined && p.allowed_regions !== null) {
        if (!Array.isArray(p.allowed_regions)) return "allowed_regions must be an array of region slugs";
        if (p.allowed_regions.length > 64) return "allowed_regions has too many entries";
        for (const r of p.allowed_regions) {
            if (typeof r !== "string" || !/^[a-z0-9][a-z0-9-]{0,30}$/.test(r)) {
                return `Invalid region slug in allowed_regions: ${r}`;
            }
        }
    }
    if (p.allowed_host_ids !== undefined && p.allowed_host_ids !== null) {
        if (!Array.isArray(p.allowed_host_ids)) return "allowed_host_ids must be an array of host ids";
        if (p.allowed_host_ids.length > 64) return "allowed_host_ids has too many entries";
        for (const h of p.allowed_host_ids) {
            if (typeof h !== "string" || h.length > 64) return `Invalid host id in allowed_host_ids: ${h}`;
        }
    }
    return null;
}

function normalizeRow(p: PlanPayload, updatedBy: string | null) {
    // Treat empty array as "no restriction" (NULL) so the column stays
    // consistent and the filter logic doesn't need to handle [].
    const allowedRegions = p.allowed_regions && p.allowed_regions.length > 0
        ? p.allowed_regions.map((r) => String(r).trim()).filter(Boolean)
        : null;
    const allowedHostIds = p.allowed_host_ids && p.allowed_host_ids.length > 0
        ? p.allowed_host_ids.map((h) => String(h).trim()).filter(Boolean)
        : null;
    return {
        slug: p.slug!,
        name: String(p.name).trim(),
        tier: p.tier as "shared" | "dedicated",
        vcpu: Number(p.vcpu),
        memory_mb: Number(p.memory_mb),
        disk_gb: Number(p.disk_gb),
        hourly_usd: Number(p.hourly_usd),
        monthly_usd: Number(p.monthly_usd),
        tagline: p.tagline ? String(p.tagline).trim() : null,
        is_active: p.is_active ?? true,
        sort_order: Number.isFinite(Number(p.sort_order)) ? Number(p.sort_order) : 0,
        allowed_regions: allowedRegions,
        allowed_host_ids: allowedHostIds,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
    };
}

async function currentUserId(): Promise<string | null> {
    try {
        const sb = await createClient();
        const { data } = await sb.auth.getUser();
        return data?.user?.id ?? null;
    } catch {
        return null;
    }
}

// ─── GET ─────────────────────────────────────────────────────────
export async function GET() {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });

    const sb = await createWorkerClient();
    const { data, error } = await sb
        .from("instance_plans")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("slug", { ascending: true });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, plans: data ?? [] });
}

// ─── POST (create) ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });

    let body: PlanPayload;
    try { body = (await req.json()) as PlanPayload; }
    catch { return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 }); }

    const err = validatePlan(body, { requireSlug: true });
    if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });

    const sb = await createWorkerClient();
    const row = normalizeRow(body, await currentUserId());
    const { data, error } = await sb.from("instance_plans").insert(row).select().single();
    if (error) {
        const msg = /duplicate|unique/i.test(error.message)
            ? `A plan with slug "${row.slug}" already exists.`
            : error.message;
        return NextResponse.json({ ok: false, error: msg }, { status: 409 });
    }
    invalidatePlanCache();
    return NextResponse.json({ ok: true, plan: data }, { status: 201 });
}

// ─── PUT (update) ────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });

    let body: PlanPayload;
    try { body = (await req.json()) as PlanPayload; }
    catch { return NextResponse.json({ ok: false, error: "Bad JSON" }, { status: 400 }); }

    if (!body.slug) return NextResponse.json({ ok: false, error: "slug is required in body" }, { status: 400 });
    const err = validatePlan(body, { requireSlug: false });
    if (err) return NextResponse.json({ ok: false, error: err }, { status: 400 });

    const sb = await createWorkerClient();
    const row = normalizeRow(body, await currentUserId());
    // slug is immutable here — never update it
    const { slug, ...updatable } = row;
    const { data, error } = await sb
        .from("instance_plans")
        .update(updatable)
        .eq("slug", slug)
        .select()
        .single();
    if (error || !data) {
        return NextResponse.json(
            { ok: false, error: error?.message ?? "Plan not found" },
            { status: error?.code === "PGRST116" ? 404 : 500 }
        );
    }
    invalidatePlanCache();
    return NextResponse.json({ ok: true, plan: data });
}

// ─── DELETE ──────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    if (!slug) return NextResponse.json({ ok: false, error: "slug query param is required" }, { status: 400 });

    const sb = await createWorkerClient();

    // Refuse delete if any active server references this plan
    const { count } = await sb
        .from("servers")
        .select("id", { count: "exact", head: true })
        .eq("plan_slug", slug)
        .in("status", ["provisioning", "running", "stopped", "suspended"]);

    if ((count ?? 0) > 0) {
        return NextResponse.json(
            {
                ok: false,
                error: `Cannot delete "${slug}" — ${count} active server${count === 1 ? "" : "s"} still reference this plan. Disable it instead (set is_active = false).`,
            },
            { status: 409 }
        );
    }

    const { error } = await sb.from("instance_plans").delete().eq("slug", slug);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    invalidatePlanCache();
    return NextResponse.json({ ok: true, deleted: slug });
}
