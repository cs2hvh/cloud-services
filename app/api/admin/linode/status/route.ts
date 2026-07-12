// Admin: Linode integration status — token validity, catalog freshness,
// deploy kill-switch, and active compute provider. Read-only.

import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { LinodeClient } from "@/lib/services/linode/client";
import type { LinodeAccount, LinodeError } from "@/lib/services/linode/types";
import {
    getComputeProvider,
    getLinodeDeployEnabled,
} from "@/lib/admin/platform-settings";

export const dynamic = "force-dynamic";

export async function GET() {
    const admin = await requireAdmin();
    if (!admin.ok) {
        return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    // Token probe — cheap authenticated call. AUTH failures surface verbatim
    // so the admin can tell "bad token" from "Linode down".
    let token: { valid: boolean; accountEmail?: string; error?: string };
    if (!process.env.LINODE_TOKEN) {
        token = { valid: false, error: "LINODE_TOKEN is not configured" };
    } else {
        try {
            const account = await LinodeClient.get<LinodeAccount>("/account");
            token = { valid: true, accountEmail: account.email };
        } catch (e) {
            const le = e as LinodeError;
            token = { valid: false, error: le.message || "Token probe failed" };
        }
    }

    const supabase = await createServiceClient();
    const [regions, types, images, pricing, lastSync] = await Promise.all([
        supabase.from("linode_regions").select("id", { count: "exact", head: true }),
        supabase.from("linode_types").select("id", { count: "exact", head: true }),
        supabase.from("linode_images").select("id", { count: "exact", head: true }),
        supabase.from("linode_pricing").select("type_id", { count: "exact", head: true }),
        supabase
            .from("linode_regions")
            .select("synced_at")
            .order("synced_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);

    const [deployEnabled, computeProvider] = await Promise.all([
        getLinodeDeployEnabled(),
        getComputeProvider(),
    ]);

    return Response.json({
        ok: true,
        token,
        catalog: {
            regions: regions.count ?? 0,
            types: types.count ?? 0,
            images: images.count ?? 0,
            pricingRows: pricing.count ?? 0,
            lastSyncedAt: lastSync.data?.synced_at ?? null,
        },
        settings: {
            linodeDeployEnabled: deployEnabled,
            computeProvider,
        },
    });
}
