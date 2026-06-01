import { NextRequest } from "next/server";

import { limitByUser } from "@/lib/cooldown/userbased";
import { checkIdempotency, getIdempotencyKey } from "@/lib/idempotency";
import {
    RunPodService,
    type CloudType,
    type CreatePodRequest,
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

/** GET /api/services/gpu/pods — list the caller's active pods. */
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
        prefix: "rl:gpu-list",
        limit: 60,
        windowMs: 60_000,
    });
    if (!rl.allowed) {
        return Response.json(
            { ok: false, error: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec },
            { status: 429 }
        );
    }

    const result = await RunPodService.listUserPods(user.id);
    if (!result.success) {
        return Response.json(
            { ok: false, error: result.error || "Unable to list pods" },
            { status: statusFromErrorCode(result.errorCode) }
        );
    }
    return Response.json({ ok: true, pods: result.data });
}

/**
 * POST /api/services/gpu/pods — create a new pod.
 * Honors Idempotency-Key header to make double-clicks safe.
 */
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
        prefix: "rl:gpu-create",
        limit: 5,
        windowMs: 3_600_000,
    });
    if (!rl.allowed) {
        return Response.json(
            {
                ok: false,
                error: "Too many GPU pods created recently. Try again later.",
                retryAfterSec: rl.retryAfterSec,
            },
            { status: 429 }
        );
    }

    // Idempotency reservation
    const idempKey = getIdempotencyKey(req.headers);
    let idempComplete: ((data: unknown) => Promise<void>) | null = null;
    if (idempKey) {
        const idemp = await checkIdempotency(`gpu-create:${user.id}:${idempKey}`);
        if (idemp.status === "completed") {
            return Response.json(idemp.data);
        }
        if (idemp.status === "in-progress") {
            return Response.json(
                {
                    ok: false,
                    error: "This request is already being processed.",
                },
                {
                    status: 409,
                    headers: { "Retry-After": String(idemp.retryAfter) },
                }
            );
        }
        const reserved = await idemp.reserve();
        if (!reserved) {
            return Response.json(
                { ok: false, error: "Duplicate request detected." },
                { status: 409 }
            );
        }
        idempComplete = idemp.complete;
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Community cloud is hidden from the UI for now; all pods land on Secure.
    // The wizard no longer surfaces this field. We ignore body.cloudType.
    const cloudType: CloudType = "SECURE";
    const createReq: CreatePodRequest = {
        ownerId: user.id,
        ownerEmail: user.email ?? null,
        name: String(body.name || ""),
        gpuCatalogId: String(body.gpuCatalogId || ""),
        gpuCount: Number(body.gpuCount || 1),
        cloudType,
        interruptible: !!body.interruptible,
        dataCenterIds: Array.isArray(body.dataCenterIds)
            ? (body.dataCenterIds as string[]).map(String)
            : undefined,
        imageName: String(body.imageName || ""),
        templateId: body.templateId ? String(body.templateId) : undefined,
        containerDiskGb: body.containerDiskGb
            ? Number(body.containerDiskGb)
            : undefined,
        volumeGb: body.volumeGb !== undefined ? Number(body.volumeGb) : undefined,
        networkVolumeId: body.networkVolumeId
            ? String(body.networkVolumeId)
            : undefined,
        ports: Array.isArray(body.ports) ? (body.ports as string[]).map(String) : undefined,
        env:
            body.env && typeof body.env === "object" && !Array.isArray(body.env)
                ? (body.env as Record<string, string>)
                : undefined,
        publicKey: body.publicKey ? String(body.publicKey) : undefined,
        rootPassword: body.rootPassword ? String(body.rootPassword) : undefined,
    };

    const result = await RunPodService.createPod(createReq);
    if (!result.success) {
        return Response.json(
            { ok: false, error: result.error || "Pod creation failed" },
            { status: statusFromErrorCode(result.errorCode) }
        );
    }

    const response = { ok: true, pod: result.data };
    if (idempComplete) {
        await idempComplete(response).catch(() => {});
    }
    return Response.json(response);
}
