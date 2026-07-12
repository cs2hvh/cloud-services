// Linode server backups
//   GET  /api/services/compute/vms/[id]/backups            — list backups
//   POST /api/services/compute/vms/[id]/backups            — { action, ... }
//        action: "enable" | "cancel" | "snapshot" | "restore"
//        snapshot: { label }   restore: { backupId, overwrite }
//
// Enabling/cancelling re-freezes the billing meter (plan rate ± backups
// add-on at today's catalog price), mirroring the resize re-rate semantics.
// The action + re-rate logic lives in the shared flow module (also used by
// the public v1 API) — this route only handles auth + the dashboard envelope.

import { NextRequest } from "next/server";

import { createClient, createWorkerClient } from "@/lib/supabase/server";
import { limitByUser } from "@/lib/cooldown/userbased";
import {
    getLinodeBackupsOverview,
    mapLinodeFlowError,
    runLinodeBackupsAction,
    type LinodeBackupsFlowServer,
} from "@/lib/services/compute/providers/linode/flows";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

interface ServerRow {
    id: number;
    name: string | null;
    owner_id: string | null;
    status: string | null;
    provider: string | null;
    linode_id: number | null;
    location: string | null;
    plan_slug: string | null;
    hourly_cost: number | null;
    billing_service_id: string | null;
    details: Record<string, unknown> | null;
}

async function loadOwnedLinodeServer(
    serverId: number,
    userId: string
): Promise<{ server?: ServerRow; response?: Response }> {
    const supabase = await createWorkerClient();
    const { data: server, error } = await supabase
        .from("servers")
        .select(
            "id, name, owner_id, status, provider, linode_id, location, plan_slug, hourly_cost, billing_service_id, details"
        )
        .eq("id", serverId)
        .maybeSingle();

    if (error) {
        return { response: Response.json({ ok: false, error: "Unable to load server" }, { status: 500 }) };
    }
    if (!server) {
        return { response: Response.json({ ok: false, error: "Server not found" }, { status: 404 }) };
    }
    if (server.owner_id !== userId) {
        return { response: Response.json({ ok: false, error: "Not authorized" }, { status: 403 }) };
    }
    if (server.provider !== "linode") {
        return {
            response: Response.json(
                { ok: false, error: "Backups are not available for this server." },
                { status: 400 }
            ),
        };
    }
    if (!server.linode_id) {
        return { response: Response.json({ ok: false, error: "Server is still provisioning" }, { status: 422 }) };
    }
    return { server: server as ServerRow };
}

function toFlowServer(server: ServerRow): LinodeBackupsFlowServer {
    return {
        id: server.id,
        name: server.name,
        linode_id: server.linode_id,
        location: server.location,
        plan_slug: server.plan_slug,
        details: server.details,
        billing_service_id: server.billing_service_id,
    };
}

export async function GET(_req: NextRequest, ctx: Ctx) {
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

    const rl = await limitByUser(user.id, { prefix: "rl:vm-backups", limit: 30, windowMs: 60_000 });
    if (!rl.allowed) {
        return Response.json(
            { ok: false, error: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec },
            { status: 429 }
        );
    }

    const { server, response } = await loadOwnedLinodeServer(serverId, user.id);
    if (response) return response;

    try {
        const supabase = await createWorkerClient();
        const overview = await getLinodeBackupsOverview(supabase, toFlowServer(server!));
        return Response.json({ ok: true, ...overview });
    } catch (e) {
        const failure = mapLinodeFlowError(e, "Failed to load backups");
        return Response.json({ ok: false, error: failure.message }, { status: failure.status });
    }
}

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

    const rl = await limitByUser(user.id, { prefix: "rl:vm-backups-mut", limit: 10, windowMs: 3600_000 });
    if (!rl.allowed) {
        return Response.json(
            { ok: false, error: "Too many backup operations. Try again later.", retryAfterSec: rl.retryAfterSec },
            { status: 429 }
        );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "");
    if (!["enable", "cancel", "snapshot", "restore"].includes(action)) {
        return Response.json({ ok: false, error: "Invalid backup action" }, { status: 400 });
    }

    const { server, response } = await loadOwnedLinodeServer(serverId, user.id);
    if (response) return response;

    const supabase = await createWorkerClient();
    const result = await runLinodeBackupsAction({
        supabase,
        server: toFlowServer(server!),
        user: { id: user.id, email: user.email },
        action: action as "enable" | "cancel" | "snapshot" | "restore",
        label: body.label === undefined || body.label === null ? undefined : String(body.label),
        backupId: body.backupId === undefined || body.backupId === null ? undefined : Number(body.backupId),
        overwrite: body.overwrite !== false, // default true (restore in place)
        userAgent: req.headers.get("user-agent"),
    });

    if (!result.ok) {
        return Response.json({ ok: false, error: result.message }, { status: result.status });
    }
    return Response.json({ ok: true, ...result.data }, { status: result.status });
}
