import { NextRequest, after } from "next/server";
import { createClient, createWorkerClient } from "@/lib/supabase/server";
import { limitByUser } from "@/lib/cooldown/userbased";
import { BillingCredits } from "@/lib/billing/credits";
import { findPlanBySlug, getActivePlans } from "@/lib/pricing/plan-catalog";
import {
  getHostAvailabilityExcludingServer,
  planFitsResize,
} from "@/lib/services/compute/resize";
import {
  proxmoxAuth,
  getDispatcher,
  configureVM,
  getVMConfig,
  findVMBootDisk,
  resizeDisk,
  type ProxmoxHost,
} from "@/lib/proxmox-utils";
import { getLinodeResizeOptions } from "@/lib/services/compute/providers/linode/ops";
import { startLinodeResizeFlow } from "@/lib/services/compute/providers/linode/flows";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/services/compute/vms/[id]/resize
 *
 * Returns the current plan + every active plan annotated with whether the
 * server can be resized to it ON ITS CURRENT HOST (capacity, disk ≥ current,
 * host whitelist). Prices are the advertised catalog prices — the same the
 * customer saw at create and is billed.
 */
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

  const supabase = await createWorkerClient();
  const { data: server } = await supabase
    .from("servers")
    .select("id, location, cpu_cores, memory_mb, disk_gb, tier, plan_slug, owner_id, status, provider, linode_id")
    .eq("id", serverId)
    .maybeSingle();

  if (!server) return Response.json({ ok: false, error: "Server not found" }, { status: 404 });
  if (server.owner_id !== user.id) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }
  if (!server.location) {
    return Response.json({ ok: false, error: "Server is not fully provisioned" }, { status: 422 });
  }

  // Linode-backed servers: targets come from the synced catalog (per-region
  // availability + prices) instead of Proxmox host capacity.
  if (server.provider === "linode") {
    try {
      const options = await getLinodeResizeOptions(
        {
          id: Number(server.id),
          linode_id: server.linode_id as number | null,
          location: server.location as string | null,
          plan_slug: server.plan_slug as string | null,
          memory_mb: server.memory_mb as number | null,
          disk_gb: server.disk_gb as number | null,
        },
        supabase
      );
      return Response.json({ ok: true, ...options });
    } catch (e) {
      console.error("[VM Resize] Linode options failed:", e instanceof Error ? e.message : e);
      return Response.json({ ok: false, error: "Unable to load resize options" }, { status: 500 });
    }
  }

  const [avail, plans] = await Promise.all([
    getHostAvailabilityExcludingServer({
      hostId: String(server.location),
      excludeServerId: serverId,
    }),
    getActivePlans(supabase),
  ]);

  const currentDiskGb = Number(server.disk_gb || 0);

  const wirePlans = plans
    .map((p) => {
      const isCurrent =
        p.slug === server.plan_slug &&
        p.vcpu === Number(server.cpu_cores) &&
        p.memoryMB === Number(server.memory_mb) &&
        p.diskGB === currentDiskGb;
      const fit = avail
        ? planFitsResize({
            plan: p,
            hostId: String(server.location),
            availability: avail.availability,
            currentDiskGb,
          })
        : { fits: false, reason: "Capacity unavailable" };
      return {
        slug: p.slug,
        name: p.name,
        tier: p.tier,
        vcpu: p.vcpu,
        memoryMB: p.memoryMB,
        diskGB: p.diskGB,
        hourlyUSD: p.defaultHourlyUSD,
        monthlyUSD: p.defaultMonthlyUSD,
        isCurrent,
        // Current plan is never "selectable" but always shown as the baseline.
        fits: isCurrent ? false : fit.fits,
        reason: isCurrent ? "Current plan" : fit.fits ? undefined : fit.reason,
      };
    })
    .sort((a, b) => a.vcpu - b.vcpu || a.memoryMB - b.memoryMB);

  return Response.json({
    ok: true,
    current: {
      planSlug: server.plan_slug ?? null,
      vcpu: Number(server.cpu_cores),
      memoryMB: Number(server.memory_mb),
      diskGB: currentDiskGb,
      tier: server.tier ?? "shared",
    },
    plans: wirePlans,
  });
}

/**
 * POST /api/services/compute/vms/[id]/resize  { planSlug }
 *
 * Validates the target plan fits on the server's host, then (in the
 * background) power-cycles the VM, applies the new CPU/RAM, grows the disk
 * if larger, updates the stored specs, and re-rates the billing meter to the
 * new plan's advertised price. Disk can only grow (Proxmox limitation).
 */
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

  // Rate limit: max 5 resizes per hour per user
  const rl = await limitByUser(user.id, { prefix: "rl:vm-resize", limit: 5, windowMs: 3600_000 });
  if (!rl.allowed) {
    return Response.json(
      { ok: false, error: "Too many resize requests. Try again later.", retryAfterSec: rl.retryAfterSec },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { planSlug?: string };
  const planSlug = body.planSlug ? String(body.planSlug) : "";
  if (!planSlug) {
    return Response.json({ ok: false, error: "A target plan is required." }, { status: 400 });
  }

  const supabase = await createWorkerClient();
  const { data: server, error: serverErr } = await supabase
    .from("servers")
    .select(
      "id, vmid, node, location, owner_id, status, cpu_cores, memory_mb, disk_gb, tier, plan_slug, billing_service_id, provider, linode_id, details"
    )
    .eq("id", serverId)
    .maybeSingle();

  if (serverErr) {
    return Response.json({ ok: false, error: "Unable to load server" }, { status: 500 });
  }
  if (!server) return Response.json({ ok: false, error: "Server not found" }, { status: 404 });
  if (server.owner_id !== user.id) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  // ── Linode-backed servers: resize via the Linode API ──
  // Linode powers the instance off, migrates, and boots it back if it was
  // running — so both running and stopped servers may start a resize.
  if (server.provider === "linode") {
    return handleLinodeResizePost({ supabase, server, serverId, userId: user.id, planSlug });
  }

  const status = String(server.status);
  if (status === "running" || status === "suspended") {
    return Response.json(
      { ok: false, error: "Power off the server before resizing." },
      { status: 409 }
    );
  }
  if (status !== "stopped") {
    return Response.json(
      { ok: false, error: "Server must be powered off to resize. Please try again shortly." },
      { status: 409 }
    );
  }
  if (!server.vmid || !server.node || !server.location) {
    return Response.json({ ok: false, error: "Server configuration is incomplete." }, { status: 422 });
  }

  // Resolve + validate the target plan.
  const plan = await findPlanBySlug(supabase, planSlug);
  if (!plan || !plan.isActive) {
    return Response.json({ ok: false, error: "That plan is no longer available." }, { status: 400 });
  }

  const currentDiskGb = Number(server.disk_gb || 0);
  const noChange =
    plan.vcpu === Number(server.cpu_cores) &&
    plan.memoryMB === Number(server.memory_mb) &&
    plan.diskGB === currentDiskGb;
  if (noChange) {
    return Response.json({ ok: false, error: "Server is already on this plan." }, { status: 400 });
  }
  if (plan.diskGB < currentDiskGb) {
    return Response.json(
      { ok: false, error: "A server's disk can't be shrunk. Choose a plan with equal or larger storage." },
      { status: 400 }
    );
  }

  // Capacity check on the server's CURRENT host (it can't migrate).
  const avail = await getHostAvailabilityExcludingServer({
    hostId: String(server.location),
    excludeServerId: serverId,
  });
  if (!avail) {
    return Response.json({ ok: false, error: "Unable to check capacity. Please try again." }, { status: 500 });
  }
  const fit = planFitsResize({
    plan,
    hostId: String(server.location),
    availability: avail.availability,
    currentDiskGb,
  });
  if (!fit.fits) {
    return Response.json(
      { ok: false, error: fit.reason ?? "This plan can't be placed in your server's location." },
      { status: 409 }
    );
  }

  // Funds: require at least 1 hour at the new rate.
  const newHourly = plan.defaultHourlyUSD;
  const hasFunds = await BillingCredits.hasSufficientBalance(user.id, newHourly);
  if (!hasFunds) {
    return Response.json(
      { ok: false, error: `Insufficient balance. You need at least $${newHourly.toFixed(2)} to resize.` },
      { status: 402 }
    );
  }

  const priorStatus = status; // "running" | "stopped" — restored after resize
  const startedAt = new Date().toISOString();

  // Flip to provisioning so the dashboard shows a live "Resizing…" state
  // (reuses the existing provisioning progress UI).
  await supabase
    .from("servers")
    .update({
      status: "provisioning",
      details: {
        provisioning: {
          stage: "resizing",
          progress: 10,
          message: `Resizing to ${plan.name}…`,
          started_at: startedAt,
        },
      },
    })
    .eq("id", serverId);

  const vmid = Number(server.vmid);
  const hostId = String(server.location);
  const billingServiceId = server.billing_service_id as string | null;

  // Background: power-cycle + apply specs + disk grow + persist + re-rate.
  after(async () => {
    const svc = await createWorkerClient();
    const setProgress = async (progress: number, message: string) => {
      try {
        await svc
          .from("servers")
          .update({
            details: {
              provisioning: { stage: "resizing", progress, message, started_at: startedAt },
            },
          })
          .eq("id", serverId);
      } catch {
        /* best-effort progress update */
      }
    };

    try {
      const { data: host } = await svc
        .from("proxmox_hosts")
        .select(
          "id, name, host_url, allow_insecure_tls, node, storage, bridge, token_id, token_secret, username, password"
        )
        .eq("id", hostId)
        .maybeSingle();
      if (!host) throw new Error("Host not found");

      const cfg = host as unknown as ProxmoxHost;
      const dispatcher = getDispatcher(!!cfg.allow_insecure_tls);
      const auth = await proxmoxAuth(cfg, dispatcher);

      // Resize is only permitted on a STOPPED server (validated above), so no
      // power-cycle is needed here — we apply config to the powered-off VM and
      // leave it stopped for the customer to start when ready.

      // 1. Grow the disk first (the only irreversible op) if the plan is larger.
      if (plan.diskGB > currentDiskGb) {
        await setProgress(40, "Expanding storage…");
        const vmConfig = await getVMConfig(cfg, vmid, auth, dispatcher);
        const boot = findVMBootDisk(vmConfig);
        if (boot && plan.diskGB > boot.sizeGb) {
          await resizeDisk(cfg, vmid, boot.disk, plan.diskGB, auth, dispatcher);
        }
      }

      // 2. Apply new CPU + RAM.
      await setProgress(75, "Applying CPU and memory…");
      await configureVM(cfg, vmid, { cores: plan.vcpu, memory: plan.memoryMB }, auth, dispatcher);

      // 3. Persist new specs; the server stays stopped.
      await svc
        .from("servers")
        .update({
          cpu_cores: plan.vcpu,
          memory_mb: plan.memoryMB,
          disk_gb: plan.diskGB,
          tier: plan.tier,
          plan_slug: plan.slug,
          hourly_cost: newHourly,
          status: priorStatus,
          details: {
            provisioning: {
              stage: "resized",
              progress: 100,
              message: `Resized to ${plan.name}`,
              completed_at: new Date().toISOString(),
            },
          },
        })
        .eq("id", serverId);

      // 4. Re-rate the billing meter to the new plan price.
      if (billingServiceId) {
        await BillingCredits.rerateActiveCompute({
          serviceId: billingServiceId,
          hourlyRate: newHourly,
        }).catch((e) => console.error("[VM Resize] re-rate failed:", e));
      }
    } catch (err) {
      console.error("[VM Resize] failed:", err instanceof Error ? err.message : err);
      // Roll the UI state back so the server isn't stuck "Resizing".
      try {
        await svc
          .from("servers")
          .update({
            status: priorStatus,
            details: {
              provisioning: {
                stage: "failed",
                progress: 100,
                message: "Resize failed. Your server was left unchanged.",
                failed_at: new Date().toISOString(),
              },
            },
          })
          .eq("id", serverId);
      } catch {
        /* best-effort rollback */
      }
    }
  });

  return Response.json({ ok: true, status: "resizing" }, { status: 202 });
}

/**
 * Linode resize — delegates to the shared flow (also used by the public v1
 * API) which validates, starts the upstream migration, and re-rates billing
 * in the background. Only the response envelope lives here.
 */
async function handleLinodeResizePost({
  supabase,
  server,
  serverId,
  userId,
  planSlug,
}: {
  supabase: Awaited<ReturnType<typeof createWorkerClient>>;
  server: Record<string, unknown>;
  serverId: number;
  userId: string;
  planSlug: string;
}) {
  const result = await startLinodeResizeFlow({
    supabase,
    server: {
      id: serverId,
      status: (server.status as string | null) ?? null,
      linode_id: (server.linode_id as number | null) ?? null,
      location: (server.location as string | null) ?? null,
      plan_slug: (server.plan_slug as string | null) ?? null,
      memory_mb: (server.memory_mb as number | null) ?? null,
      disk_gb: (server.disk_gb as number | null) ?? null,
      details: (server.details as Record<string, unknown> | null) ?? null,
      billing_service_id: (server.billing_service_id as string | null) ?? null,
    },
    userId,
    planSlug,
  });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.message }, { status: result.status });
  }
  return Response.json({ ok: true, status: "resizing" }, { status: 202 });
}
