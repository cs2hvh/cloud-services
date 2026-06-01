import { NextRequest } from "next/server";

import { limitByUser } from "@/lib/cooldown/userbased";
import { checkIdempotency, getIdempotencyKey } from "@/lib/idempotency";
import {
    RunPodService,
    type CreateNetworkVolumeRequest,
    type RunPodErrorCode,
} from "@/lib/services/runpod-service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function statusFromErrorCode(code: RunPodErrorCode | undefined): number {
    switch (code) {
        case "AUTH":
            return 401;
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

/** GET /api/services/gpu/volumes — list caller's network volumes. */
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
        prefix: "rl:gpu-vol-list",
        limit: 60,
        windowMs: 60_000,
    });
    if (!rl.allowed) {
        return Response.json(
            { ok: false, error: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec },
            { status: 429 }
        );
    }

    const result = await RunPodService.listUserVolumes(user.id);
    if (!result.success) {
        return Response.json(
            { ok: false, error: result.error || "Unable to list volumes" },
            { status: statusFromErrorCode(result.errorCode) }
        );
    }
    return Response.json({ ok: true, volumes: result.data });
}

/** POST /api/services/gpu/volumes — create a new network volume. */
export async function POST(req: NextRequest) {
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
        prefix: "rl:gpu-vol-create",
        limit: 5,
        windowMs: 3_600_000,
    });
    if (!rl.allowed) {
        return Response.json(
            {
                ok: false,
                error: "Too many volume creations. Try again later.",
                retryAfterSec: rl.retryAfterSec,
            },
            { status: 429 }
        );
    }

    const idempKey = getIdempotencyKey(req.headers);
    let idempComplete: ((data: unknown) => Promise<void>) | null = null;
    if (idempKey) {
        const idemp = await checkIdempotency(`gpu-vol-create:${user.id}:${idempKey}`);
        if (idemp.status === "completed") return Response.json(idemp.data);
        if (idemp.status === "in-progress") {
            return Response.json(
                { ok: false, error: "Already processing" },
                { status: 409, headers: { "Retry-After": String(idemp.retryAfter) } }
            );
        }
        const reserved = await idemp.reserve();
        if (!reserved) {
            return Response.json(
                { ok: false, error: "Duplicate request" },
                { status: 409 }
            );
        }
        idempComplete = idemp.complete;
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const createReq: CreateNetworkVolumeRequest = {
        ownerId: user.id,
        ownerEmail: user.email ?? null,
        name: String(body.name || ""),
        sizeGb: Number(body.sizeGb || 0),
        dataCenterId: String(body.dataCenterId || ""),
    };

    const result = await RunPodService.createVolume(createReq);
    if (!result.success) {
        return Response.json(
            { ok: false, error: result.error || "Volume creation failed" },
            { status: statusFromErrorCode(result.errorCode) }
        );
    }

    const response = { ok: true, volume: result.data };
    if (idempComplete) {
        await idempComplete(response).catch(() => {});
    }
    return Response.json(response);
}
