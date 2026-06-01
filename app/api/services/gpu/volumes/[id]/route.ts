import { NextRequest } from "next/server";

import { limitByUser } from "@/lib/cooldown/userbased";
import {
    RunPodService,
    type RunPodErrorCode,
} from "@/lib/services/runpod-service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function statusFromErrorCode(code: RunPodErrorCode | undefined): number {
    switch (code) {
        case "AUTH":
            return 403;
        case "NOT_FOUND":
            return 404;
        case "CAPACITY":
            return 409;
        case "INVALID":
            return 400;
        case "RATE_LIMIT":
            return 429;
        case "TIMEOUT":
            return 504;
        case "SERVER":
        case "UNKNOWN":
        default:
            return 500;
    }
}

function parseId(raw: string): number | null {
    const n = Number(raw);
    return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

/** DELETE /api/services/gpu/volumes/[id] — destroy a network volume. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
    const { id } = await ctx.params;
    const volumeId = parseId(id);
    if (volumeId === null) {
        return Response.json(
            { ok: false, error: "Invalid volume id" },
            { status: 400 }
        );
    }

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
        prefix: "rl:gpu-vol-delete",
        limit: 10,
        windowMs: 3_600_000,
    });
    if (!rl.allowed) {
        return Response.json(
            {
                ok: false,
                error: "Too many delete requests. Try again later.",
                retryAfterSec: rl.retryAfterSec,
            },
            { status: 429 }
        );
    }

    const result = await RunPodService.deleteVolume({ volumeId, ownerId: user.id });
    if (!result.success) {
        return Response.json(
            { ok: false, error: result.error || "Failed to delete volume" },
            { status: statusFromErrorCode(result.errorCode) }
        );
    }
    return Response.json({ ok: true, volumeId: result.data?.volumeId });
}
