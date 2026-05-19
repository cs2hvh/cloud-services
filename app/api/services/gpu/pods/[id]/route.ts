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

/** GET /api/services/gpu/pods/[id] — fetch a single pod the caller owns. */
export async function GET(_req: NextRequest, ctx: Ctx) {
    const { id } = await ctx.params;
    const podId = parseId(id);
    if (podId === null) {
        return Response.json(
            { ok: false, error: "Invalid pod id" },
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
        prefix: "rl:gpu-get",
        limit: 60,
        windowMs: 60_000,
    });
    if (!rl.allowed) {
        return Response.json(
            { ok: false, error: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec },
            { status: 429 }
        );
    }

    const result = await RunPodService.getUserPod(podId, user.id);
    if (!result.success) {
        return Response.json(
            { ok: false, error: result.error || "Pod not found" },
            { status: statusFromErrorCode(result.errorCode) }
        );
    }
    return Response.json({ ok: true, pod: result.data });
}

/** DELETE /api/services/gpu/pods/[id] — terminate the pod and close billing. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
    const { id } = await ctx.params;
    const podId = parseId(id);
    if (podId === null) {
        return Response.json(
            { ok: false, error: "Invalid pod id" },
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
        prefix: "rl:gpu-delete",
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

    const result = await RunPodService.destroyPod({ podId, ownerId: user.id });
    if (!result.success) {
        return Response.json(
            { ok: false, error: result.error || "Failed to destroy pod" },
            { status: statusFromErrorCode(result.errorCode) }
        );
    }
    return Response.json({
        ok: true,
        podId: result.data?.podId,
        finalChargeUsd: result.data?.finalCharge,
    });
}
