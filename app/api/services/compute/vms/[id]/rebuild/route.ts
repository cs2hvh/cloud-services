// POST /api/services/compute/vms/[id]/rebuild
//
// Rebuild a Linode-backed server with a fresh image: wipes all disks, deploys
// the chosen image with a new root password (+ optional SSH keys), and boots.
// Linode-only — Proxmox servers use custom-image reprovisioning instead.
//
// The rebuild orchestration (validation, upstream call, background polling,
// notifications) lives in the shared flow module — also used by the public
// v1 API. This route only handles auth + the dashboard envelope.

import { NextRequest } from "next/server";

import { createClient, createWorkerClient } from "@/lib/supabase/server";
import { limitByUser } from "@/lib/cooldown/userbased";
import { validateRootPassword } from "@/lib/services/compute/providers/linode/create";
import { startLinodeRebuildFlow } from "@/lib/services/compute/providers/linode/flows";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
    const { id } = await ctx.params;
    const serverId = Number(id);
    if (!serverId || isNaN(serverId)) {
        return Response.json({ ok: false, error: "Invalid server ID" }, { status: 400 });
    }

    const supabaseAuth = await createClient();
    const {
        data: { user },
        error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
        return Response.json({ ok: false, error: "Authentication required" }, { status: 401 });
    }

    // Rate limit: rebuilds are destructive + heavy — 5 per hour.
    const rl = await limitByUser(user.id, { prefix: "rl:vm-rebuild", limit: 5, windowMs: 3600_000 });
    if (!rl.allowed) {
        return Response.json(
            { ok: false, error: "Too many rebuild requests. Try again later.", retryAfterSec: rl.retryAfterSec },
            { status: 429 }
        );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const imageId = String(body.image || "");
    const rootPass = String(body.root_pass || "");
    const sshKeyIds = Array.isArray(body.ssh_key_ids)
        ? (body.ssh_key_ids as unknown[]).map(String).slice(0, 25)
        : [];

    if (!imageId) return Response.json({ ok: false, error: "image is required" }, { status: 400 });
    const passError = validateRootPassword(rootPass);
    if (passError) return Response.json({ ok: false, error: passError }, { status: 400 });

    const supabase = await createWorkerClient();
    const { data: server, error: serverErr } = await supabase
        .from("servers")
        .select("id, name, owner_id, owner_email, status, provider, linode_id, location, details")
        .eq("id", serverId)
        .maybeSingle();

    if (serverErr) return Response.json({ ok: false, error: "Unable to load server" }, { status: 500 });
    if (!server) return Response.json({ ok: false, error: "Server not found" }, { status: 404 });
    if (server.owner_id !== user.id) {
        return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
    }

    const result = await startLinodeRebuildFlow({
        supabase,
        server: {
            id: serverId,
            name: (server.name as string | null) ?? null,
            status: (server.status as string | null) ?? null,
            provider: (server.provider as string | null) ?? null,
            linode_id: (server.linode_id as number | null) ?? null,
            location: (server.location as string | null) ?? null,
            details: (server.details as Record<string, unknown> | null) ?? null,
        },
        user: { id: user.id, email: user.email },
        imageId,
        rootPass,
        sshKeyIds,
        userAgent: req.headers.get("user-agent"),
    });

    if (!result.ok) {
        return Response.json({ ok: false, error: result.message }, { status: result.status });
    }
    return Response.json({ ok: true, status: "rebuilding" }, { status: 202 });
}
