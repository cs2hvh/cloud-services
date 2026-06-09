import { NextRequest } from "next/server";

import { limitByUser } from "@/lib/cooldown/userbased";
import { RunPodService } from "@/lib/services/runpod-service";
import { createClient } from "@/lib/supabase/server";
import { getGpuDeployEnabled } from "@/lib/admin/platform-settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/services/gpu/inventory
 *
 * Returns the latest stock + pricing snapshot per (gpu, cloud), joined with
 * the curated catalog. Snapshots are refreshed by an internal cron-triggered
 * job; this endpoint is a cheap DB read.
 */
export async function GET(_req: NextRequest) {
    const supabaseAuth = await createClient();
    const {
        data: { user },
        error: authErr,
    } = await supabaseAuth.auth.getUser();
    if (authErr || !user) {
        return Response.json(
            { ok: false, error: "Authentication required" },
            { status: 401 }
        );
    }

    const rl = await limitByUser(user.id, {
        prefix: "rl:gpu-inventory",
        limit: 60,
        windowMs: 60_000,
    });
    if (!rl.allowed) {
        return Response.json(
            { ok: false, error: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec },
            { status: 429 }
        );
    }

    const result = await RunPodService.listLatest();
    if (!result.success) {
        return Response.json(
            { ok: false, error: result.error || "Unable to load inventory" },
            { status: 500 }
        );
    }

    // When the admin "out of stock" switch is off, present every GPU as
    // out-of-stock so the wizard blocks deployment (the create API also rejects).
    const deployEnabled = await getGpuDeployEnabled();
    const inventory = deployEnabled
        ? result.data
        : (result.data ?? []).map((row) => ({
              ...row,
              stockStatus: "none" as const,
              availableCounts: [],
          }));

    return Response.json({ ok: true, inventory, deployEnabled });
}
