import { NextRequest } from "next/server";

import { limitByUser } from "@/lib/cooldown/userbased";
import {
    RunPodService,
    type RunPodErrorCode,
} from "@/lib/services/runpod-service";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
type Action = "start" | "stop" | "restart";

const ALLOWED_ACTIONS: Action[] = ["start", "stop", "restart"];

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

/** POST /api/services/gpu/pods/[id]/power — start, stop, or restart a pod. */
export async function POST(req: NextRequest, ctx: Ctx) {
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
        prefix: "rl:gpu-power",
        limit: 20,
        windowMs: 60_000,
    });
    if (!rl.allowed) {
        return Response.json(
            {
                ok: false,
                error: "Too many power actions. Try again shortly.",
                retryAfterSec: rl.retryAfterSec,
            },
            { status: 429 }
        );
    }

    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const raw = String(body.action || "").toLowerCase();
    if (!(ALLOWED_ACTIONS as string[]).includes(raw)) {
        return Response.json(
            {
                ok: false,
                error: `Invalid action. Expected one of: ${ALLOWED_ACTIONS.join(", ")}`,
            },
            { status: 400 }
        );
    }
    const action = raw as Action;

    const result = await RunPodService.powerPod({
        podId,
        ownerId: user.id,
        action,
    });
    if (!result.success) {
        return Response.json(
            { ok: false, error: result.error || `Failed to ${action} pod` },
            { status: statusFromErrorCode(result.errorCode) }
        );
    }
    return Response.json({ ok: true, action, status: result.data?.status });
}
