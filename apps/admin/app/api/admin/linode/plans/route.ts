// Admin: Linode plans (types) — full catalog including inactive rows and the
// gpu/accelerated classes the customer catalog excludes, joined with the
// admin-managed linode_pricing resale controls.
//
// GET → { ok, plans: [...] } — each row carries the computed customer price
//       (base region: max(hourly * markup, floor), monthly = hourly * 720 —
//       resolveLinodePlanPrice semantics) plus an availability summary.
// PATCH { type_id, markup_pct?, floor_per_hour_usd?, is_active?, type_is_active? }
//       → is_active flips linode_pricing.is_active (sellable switch),
//         type_is_active flips linode_types.is_active (catalog listing switch).

import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
    invalidateLinodeCatalogCache,
    selectAllAvailabilityRows,
} from "@/lib/pricing/linode-catalog";
import { AuditLogService } from "@/lib/audit";

export const dynamic = "force-dynamic";

const HOURS_PER_MONTH = 720;

function round(value: number, dp: number): number {
    const f = Math.pow(10, dp);
    return Math.round(value * f) / f;
}

export async function GET() {
    const admin = await requireAdmin();
    if (!admin.ok) {
        return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const supabase = await createServiceClient();
    const [typesRes, pricingRes, availRes, bookPlansRes, bookPricesRes] = await Promise.all([
        supabase
            .from("linode_types")
            .select(
                "id, label, class, vcpus, memory_mb, disk_mb, transfer_gb, network_out_mbps, hourly_usd, monthly_usd, backups_hourly_usd, is_active, synced_at"
            )
            .order("class")
            .order("memory_mb"),
        supabase.from("linode_pricing").select("type_id, markup_pct, floor_per_hour_usd, is_active"),
        // Paginated read — the table exceeds PostgREST's ~1000-row cap.
        selectAllAvailabilityRows(supabase),
        // The CHARGE book: what compute meters actually bill. This tab edits
        // the QUOTE (markup on Linode's list); the two are different books —
        // GPU's lesson — so each row also carries the book's answer and the
        // UI chips drift between them.
        supabase
            .from("service_plans")
            .select("plan_key, provider_size")
            .eq("service_type", "compute")
            .eq("is_active", true),
        supabase
            .schema("billing")
            .from("service_pricing")
            .select("plan_key, unit, amount")
            .eq("service_type", "compute")
            .is("effective_to", null),
    ]);

    if (typesRes.error) {
        return Response.json({ ok: false, error: typesRes.error.message }, { status: 500 });
    }

    const pricingByType = new Map(
        (pricingRes.data ?? []).map((p) => [
            p.type_id as string,
            {
                markup_pct: Number(p.markup_pct ?? 1),
                floor_per_hour_usd: Number(p.floor_per_hour_usd ?? 0),
                is_active: Boolean(p.is_active),
            },
        ])
    );

    // n regions with capacity / total regions reporting each type.
    const counts = new Map<string, { available: number; total: number }>();
    for (const row of availRes.rows) {
        const key = row.type_id;
        const entry = counts.get(key) ?? { available: 0, total: 0 };
        entry.total += 1;
        if (row.available) entry.available += 1;
        counts.set(key, entry);
    }

    // linode type id → charge-book monthly, via service_plans.provider_size.
    const bookPriceByPlanKey = new Map(
        (bookPricesRes.data ?? []).map((p) => [
            p.plan_key as string,
            p.unit === "usd_per_hour"
                ? Number(p.amount) * HOURS_PER_MONTH
                : Number(p.amount),
        ])
    );
    const bookByProviderSize = new Map<string, { planKey: string; monthly: number }>();
    for (const sp of bookPlansRes.data ?? []) {
        if (!sp.provider_size) continue;
        const monthly =
            bookPriceByPlanKey.get(sp.plan_key as string) ?? bookPriceByPlanKey.get("*");
        if (monthly !== undefined) {
            bookByProviderSize.set(sp.provider_size as string, {
                planKey: sp.plan_key as string,
                monthly: round(monthly, 2),
            });
        }
    }

    const plans = (typesRes.data ?? []).map((t) => {
        const pricing = pricingByType.get(t.id as string) ?? {
            markup_pct: 1,
            floor_per_hour_usd: 0,
            is_active: true,
        };
        const hourly = Number(t.hourly_usd);
        // Base-region resale price; region_prices overrides resolve at quote time.
        const resaleHourly = round(
            Math.max(hourly * pricing.markup_pct, pricing.floor_per_hour_usd),
            5
        );
        return {
            id: t.id as string,
            label: t.label as string,
            class: t.class as string,
            vcpus: Number(t.vcpus),
            memory_mb: Number(t.memory_mb),
            disk_mb: Number(t.disk_mb),
            transfer_gb: Number(t.transfer_gb),
            network_out_mbps: Number(t.network_out_mbps),
            hourly_usd: hourly,
            monthly_usd: Number(t.monthly_usd),
            backups_hourly_usd: t.backups_hourly_usd === null ? null : Number(t.backups_hourly_usd),
            type_is_active: Boolean(t.is_active),
            markup_pct: pricing.markup_pct,
            floor_per_hour_usd: pricing.floor_per_hour_usd,
            pricing_is_active: pricing.is_active,
            resale_hourly_usd: resaleHourly,
            resale_monthly_usd: round(resaleHourly * HOURS_PER_MONTH, 2),
            available_regions: counts.get(t.id as string)?.available ?? 0,
            total_regions: counts.get(t.id as string)?.total ?? 0,
            book: bookByProviderSize.get(t.id as string) ?? null,
        };
    });

    return Response.json({ ok: true, plans });
}

interface PlanPatchBody {
    type_id?: unknown;
    markup_pct?: unknown;
    floor_per_hour_usd?: unknown;
    is_active?: unknown;
    type_is_active?: unknown;
}

export async function PATCH(req: NextRequest) {
    const admin = await requireAdmin();
    if (!admin.ok) {
        return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as PlanPatchBody;
    const typeId = typeof body.type_id === "string" ? body.type_id : "";
    if (!typeId) {
        return Response.json({ ok: false, error: "type_id is required" }, { status: 400 });
    }

    const pricingUpdates: Record<string, unknown> = {};
    if (body.markup_pct !== undefined) {
        const markup = Number(body.markup_pct);
        if (!Number.isFinite(markup) || markup < 1) {
            return Response.json(
                { ok: false, error: "markup_pct must be ≥ 1.000 (e.g. 1.25 = 25% markup)" },
                { status: 400 }
            );
        }
        pricingUpdates.markup_pct = markup;
    }
    if (body.floor_per_hour_usd !== undefined) {
        const floor = Number(body.floor_per_hour_usd);
        if (!Number.isFinite(floor) || floor < 0) {
            return Response.json(
                { ok: false, error: "floor_per_hour_usd must be ≥ 0" },
                { status: 400 }
            );
        }
        pricingUpdates.floor_per_hour_usd = floor;
    }
    if (body.is_active !== undefined) {
        if (typeof body.is_active !== "boolean") {
            return Response.json({ ok: false, error: "is_active must be a boolean" }, { status: 400 });
        }
        pricingUpdates.is_active = body.is_active;
    }
    const hasTypeActive = body.type_is_active !== undefined;
    if (hasTypeActive && typeof body.type_is_active !== "boolean") {
        return Response.json({ ok: false, error: "type_is_active must be a boolean" }, { status: 400 });
    }

    if (Object.keys(pricingUpdates).length === 0 && !hasTypeActive) {
        return Response.json({ ok: false, error: "No changes provided" }, { status: 400 });
    }

    const supabase = await createServiceClient();

    // Anchor on the type row: 404 unknown ids instead of seeding orphan pricing.
    const { data: typeRow, error: typeError } = await supabase
        .from("linode_types")
        .select("id, label")
        .eq("id", typeId)
        .maybeSingle();
    if (typeError) {
        return Response.json({ ok: false, error: typeError.message }, { status: 500 });
    }
    if (!typeRow) {
        return Response.json({ ok: false, error: `Type ${typeId} not found` }, { status: 404 });
    }

    if (Object.keys(pricingUpdates).length > 0) {
        // Upsert: sync auto-seeds pricing rows, but survive a missing one.
        const { error } = await supabase
            .from("linode_pricing")
            .upsert(
                { type_id: typeId, ...pricingUpdates, updated_by: admin.userId ?? null },
                { onConflict: "type_id" }
            );
        if (error) {
            return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
    }

    if (hasTypeActive) {
        const { error } = await supabase
            .from("linode_types")
            .update({ is_active: body.type_is_active === true })
            .eq("id", typeId);
        if (error) {
            return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
    }

    invalidateLinodeCatalogCache();

    try {
        await AuditLogService.create({
            user_id: admin.userId || "",
            user_email: admin.email,
            user_role: "admin",
            action: "update",
            service_type: "compute",
            service_id: typeId,
            service_name: `Linode plan ${(typeRow.label as string) ?? typeId}`,
            metadata: {
                operation: "admin.linode.plan.update",
                type_id: typeId,
                ...pricingUpdates,
                ...(hasTypeActive ? { type_is_active: body.type_is_active === true } : {}),
            },
            user_agent: req.headers.get("user-agent") || undefined,
        });
    } catch {
        // audit must never fail the mutation
    }

    return Response.json({ ok: true });
}
