import { NextRequest } from "next/server";

import { limitByUser } from "@/lib/cooldown/userbased";
import { RunPodService } from "@/lib/services/runpod-service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/services/gpu/templates
 *
 * Active pod templates the deploy wizard offers (company-owned container
 * images). Admin-managed catalog; this is a cheap DB read.
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
        prefix: "rl:gpu-templates",
        limit: 60,
        windowMs: 60_000,
    });
    if (!rl.allowed) {
        return Response.json(
            { ok: false, error: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec },
            { status: 429 }
        );
    }

    const result = await RunPodService.listTemplates();
    if (!result.success) {
        return Response.json(
            { ok: false, error: result.error || "Unable to load templates" },
            { status: 500 }
        );
    }
    return Response.json({ ok: true, templates: result.data });
}
