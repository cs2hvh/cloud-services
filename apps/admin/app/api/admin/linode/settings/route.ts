// Admin: Linode platform switches — the deploy kill-switch (blocks new
// customer deploys only; day-2 ops always work) and the compute provisioning
// backend (linode | proxmox) that routes NEW server creates.
//
// GET   → { ok, linodeDeployEnabled, computeProvider }
// PATCH { linode_deploy_enabled?, compute_provider? } → { ok, ...fresh values }

import { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/supabase/auth";
import {
    getComputeProvider,
    getLinodeDeployEnabled,
    setComputeProvider,
    setLinodeDeployEnabled,
    type ComputeProvider,
} from "@/lib/admin/platform-settings";
import { AuditLogService } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
    const admin = await requireAdmin();
    if (!admin.ok) {
        return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const [linodeDeployEnabled, computeProvider] = await Promise.all([
        getLinodeDeployEnabled(),
        getComputeProvider(),
    ]);

    return Response.json({ ok: true, linodeDeployEnabled, computeProvider });
}

interface SettingsPatchBody {
    linode_deploy_enabled?: unknown;
    compute_provider?: unknown;
}

export async function PATCH(req: NextRequest) {
    const admin = await requireAdmin();
    if (!admin.ok) {
        return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as SettingsPatchBody;
    const hasDeploy = body.linode_deploy_enabled !== undefined;
    const hasProvider = body.compute_provider !== undefined;

    if (!hasDeploy && !hasProvider) {
        return Response.json({ ok: false, error: "No changes provided" }, { status: 400 });
    }
    if (hasDeploy && typeof body.linode_deploy_enabled !== "boolean") {
        return Response.json(
            { ok: false, error: "linode_deploy_enabled must be a boolean" },
            { status: 400 }
        );
    }
    if (hasProvider && body.compute_provider !== "linode" && body.compute_provider !== "proxmox") {
        return Response.json(
            { ok: false, error: "compute_provider must be 'linode' or 'proxmox'" },
            { status: 400 }
        );
    }

    const changes: Record<string, unknown> = {};
    if (hasDeploy) {
        const enabled = body.linode_deploy_enabled === true;
        await setLinodeDeployEnabled(enabled, admin.userId);
        changes.linode_deploy_enabled = enabled;
    }
    if (hasProvider) {
        const provider = body.compute_provider as ComputeProvider;
        await setComputeProvider(provider, admin.userId);
        changes.compute_provider = provider;
    }

    try {
        await AuditLogService.create({
            user_id: admin.userId || "",
            user_email: admin.email,
            user_role: "admin",
            action: "update",
            service_type: "compute",
            service_id: "linode-settings",
            service_name: "Linode platform settings",
            metadata: { operation: "admin.linode.settings.update", ...changes },
            user_agent: req.headers.get("user-agent") || undefined,
        });
    } catch {
        // audit must never fail the mutation
    }

    const [linodeDeployEnabled, computeProvider] = await Promise.all([
        getLinodeDeployEnabled(),
        getComputeProvider(),
    ]);

    return Response.json({ ok: true, linodeDeployEnabled, computeProvider });
}
