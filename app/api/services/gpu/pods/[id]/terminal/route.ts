import { NextRequest } from "next/server";

import { createGpuTerminalToken } from "@/lib/gpu-terminal-token";
import { limitByUser } from "@/lib/cooldown/userbased";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/services/gpu/pods/[id]/terminal
 *
 * Mints a 60-second ticket for the web-terminal WebSocket. This route is the
 * ONLY place ownership is established; the socket handler trusts the signature
 * and re-checks the owner, but never takes a target from the client.
 *
 * Returns no credentials — see lib/gpu-terminal-token.ts for why the private
 * key stays server-side.
 */
export async function POST(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    const { id } = await ctx.params;
    const podId = Number.parseInt(id, 10);
    if (!Number.isInteger(podId) || podId <= 0) {
        return Response.json({ ok: false, error: "Invalid pod id" }, { status: 400 });
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

    // Deliberately tight. A terminal ticket is a step toward a root shell, so
    // the cost of brute-forcing pod ids should be high even for a valid user.
    const rl = await limitByUser(user.id, {
        prefix: "rl:gpu-terminal",
        limit: 10,
        windowMs: 60_000,
    });
    if (!rl.allowed) {
        return Response.json(
            { ok: false, error: "Too many terminal requests", retryAfterSec: rl.retryAfterSec },
            { status: 429 }
        );
    }

    // Service client: gpu_pods is not exposed to anon/authenticated directly,
    // so ownership is enforced here in the query rather than by RLS.
    const supabase = await createServiceClient();
    const { data: pod, error } = await supabase
        .from("gpu_pods")
        .select("id, owner_id, status, public_ip, port_mappings, terminal_key_blob")
        .eq("id", podId)
        .eq("owner_id", user.id)
        .maybeSingle<{
            id: number;
            owner_id: string;
            status: string;
            public_ip: string | null;
            port_mappings: Record<string, number> | null;
            terminal_key_blob: string | null;
        }>();

    if (error) {
        console.error("[GPU terminal] pod lookup failed:", error.message);
        return Response.json({ ok: false, error: "Lookup failed" }, { status: 500 });
    }
    // Same response for "not yours" and "does not exist" — distinguishing them
    // would let someone enumerate which pod ids are real.
    if (!pod) {
        return Response.json({ ok: false, error: "Pod not found" }, { status: 404 });
    }

    if (pod.status !== "running") {
        return Response.json(
            { ok: false, error: `Pod is ${pod.status} — start it to open a terminal` },
            { status: 409 }
        );
    }
    if (!pod.public_ip || !pod.port_mappings?.["22"]) {
        return Response.json(
            { ok: false, error: "Pod has no reachable SSH port yet" },
            { status: 409 }
        );
    }
    // Pods created before the platform keypair existed have no key to
    // authenticate with. Say so plainly rather than opening a socket that will
    // fail at handshake with something cryptic.
    if (!pod.terminal_key_blob) {
        return Response.json(
            {
                ok: false,
                error:
                    "This pod predates the web terminal. Recreate it, or connect over SSH.",
            },
            { status: 409 }
        );
    }

    return Response.json({
        ok: true,
        token: createGpuTerminalToken({ podId: pod.id, userId: user.id }),
        expiresInSec: 60,
    });
}
