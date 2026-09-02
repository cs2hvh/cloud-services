// Admin: Linode integration status — token validity, catalog freshness,
// deploy kill-switch, and active compute provider. Read-only.

import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { LinodeClient } from "@/lib/services/linode/client";
import type { LinodeAccount, LinodeError, LinodeProfile } from "@/lib/services/linode/types";
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
    //
    // /profile is the liveness check because every token shape can read it. A
    // least-privilege token (scoped to Linodes only, as the resell fleet should
    // be) legitimately cannot read /account — probing that first reports a
    // perfectly healthy integration as broken, and hides a genuinely expired
    // token behind a permanent false alarm. /account is enriched in only when
    // the scope happens to be granted.
    let token: {
        valid: boolean;
        accountEmail?: string;
        username?: string;
        restricted?: boolean;
        error?: string;
    };
    if (!process.env.LINODE_TOKEN) {
        token = { valid: false, error: "LINODE_TOKEN is not configured" };
    } else {
        try {
            const profile = await LinodeClient.get<LinodeProfile>("/profile");
            token = {
                valid: true,
                username: profile.username,
                restricted: profile.restricted === true,
            };
            try {
                const account = await LinodeClient.get<LinodeAccount>("/account");
                token.accountEmail = account.email;
            } catch {
                // No `account` scope — expected on a least-privilege token.
            }
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
