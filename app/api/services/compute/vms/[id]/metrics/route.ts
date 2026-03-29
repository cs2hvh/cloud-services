import { NextRequest } from "next/server";
import { createClient, createWorkerClient } from "@/lib/supabase/server";
import {
  proxmoxAuth,
  getDispatcher,
  getVMStatus,
  getVMRRDData,
  type ProxmoxHost,
} from "@/lib/proxmox-utils";
import { limitByUser } from "@/lib/cooldown/userbased";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Sanitized VM metrics response shape */
interface VMMetricsResponse {
  ok: true;
  metrics: {
    /** CPU usage as 0–100 percentage */
    cpu: number;
    /** Memory used in bytes */
    mem_used: number;
    /** Memory total in bytes */
    mem_total: number;
    /** Memory usage as 0–100 percentage */
    mem_pct: number;
    /** Disk read bytes total */
    disk_read: number;
    /** Disk write bytes total */
    disk_write: number;
    /** Network in bytes total */
    net_in: number;
    /** Network out bytes total */
    net_out: number;
    /** VM uptime in seconds */
    uptime: number;
    /** VM status from Proxmox */
    status: string;
    /** ISO timestamp */
    timestamp: string;
  };
  /** Recent time-series data points (last hour, ~70 points) */
  history: {
    time: number;
    cpu: number;
    mem_pct: number;
    net_in: number;
    net_out: number;
    disk_read: number;
    disk_write: number;
  }[];
}

/**
 * GET /api/services/compute/vms/[id]/metrics
 *
 * Returns real-time VM resource metrics from Proxmox.
 * Rate limited to 30 req/min per user to prevent Proxmox API abuse.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const serverId = Number(id);
  if (!serverId || isNaN(serverId)) {
    return Response.json({ ok: false, error: "Invalid server ID" }, { status: 400 });
  }

  /* ── Auth ─────────────────────────────────────────── */
  const supabaseAuth = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    return Response.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  /* ── Rate limit (30 req/min) ──────────────────────── */
  const rl = await limitByUser(user.id, {
    prefix: "rl:vm-metrics",
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return Response.json(
      { ok: false, error: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec },
      { status: 429 }
    );
  }

  /* ── Fetch server record (with ownership check) ──── */
  const supabase = await createWorkerClient();
  const { data: server, error: dbError } = await supabase
    .from("servers")
    .select("id, vmid, node, location, status, owner_id")
    .eq("id", serverId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (dbError) {
    console.error("[VM Metrics] DB lookup failed:", dbError.message);
    return Response.json({ ok: false, error: "Unable to load server" }, { status: 500 });
  }
  if (!server) {
    return Response.json({ ok: false, error: "Server not found" }, { status: 404 });
  }

  /* ── Validate prerequisites ───────────────────────── */
  if (!server.vmid || !server.location) {
    return Response.json(
      { ok: false, error: "Server not fully provisioned" },
      { status: 422 }
    );
  }

  if (server.status === "provisioning") {
    return Response.json(
      { ok: false, error: "Server is still provisioning" },
      { status: 422 }
    );
  }

  /* ── Fetch Proxmox host config ────────────────────── */
  const { data: host, error: hostError } = await supabase
    .from("proxmox_hosts")
    .select("*")
    .eq("id", server.location)
    .maybeSingle();

  if (hostError || !host) {
    console.error("[VM Metrics] Host lookup failed:", hostError?.message);
    return Response.json(
      { ok: false, error: "Infrastructure host unavailable" },
      { status: 503 }
    );
  }

  /* ── Query Proxmox ────────────────────────────────── */
  try {
    const pxHost = host as ProxmoxHost;
    const dispatcher = getDispatcher(pxHost.allow_insecure_tls);
    const auth = await proxmoxAuth(pxHost, dispatcher);

    // Fetch current status and RRD history in parallel
    const [vmStatus, rrdData] = await Promise.all([
      getVMStatus(pxHost, server.vmid, auth, dispatcher),
      getVMRRDData(pxHost, server.vmid, auth, "hour", "AVERAGE", dispatcher),
    ]);

    // Proxmox status/current returns: cpu (0-1 fraction), mem, maxmem,
    // netin, netout, diskread, diskwrite, uptime, status, etc.
    const cpuPct = Math.min(100, Math.max(0, (vmStatus.cpu ?? 0) * 100));
    const memUsed = vmStatus.mem ?? 0;
    const memTotal = vmStatus.maxmem ?? 1;
    const memPct = memTotal > 0
      ? Math.min(100, Math.max(0, (memUsed / memTotal) * 100))
      : 0;

    const metrics: VMMetricsResponse["metrics"] = {
      cpu: Math.round(cpuPct * 100) / 100,
      mem_used: memUsed,
      mem_total: memTotal,
      mem_pct: Math.round(memPct * 100) / 100,
      disk_read: vmStatus.diskread ?? 0,
      disk_write: vmStatus.diskwrite ?? 0,
      net_in: vmStatus.netin ?? 0,
      net_out: vmStatus.netout ?? 0,
      uptime: vmStatus.uptime ?? 0,
      status: vmStatus.status ?? "unknown",
      timestamp: new Date().toISOString(),
    };

    // Sanitize RRD data: only return numeric fields, drop any NaN/Infinity
    const history = (Array.isArray(rrdData) ? rrdData : [])
      .filter((pt: any) => pt && typeof pt.time === "number")
      .map((pt: any) => ({
        time: pt.time,
        cpu: clampPct((pt.cpu ?? 0) * 100),
        mem_pct: pt.maxmem && pt.maxmem > 0
          ? clampPct(((pt.mem ?? 0) / pt.maxmem) * 100)
          : 0,
        net_in: sanitizeNum(pt.netin),
        net_out: sanitizeNum(pt.netout),
        disk_read: sanitizeNum(pt.diskread),
        disk_write: sanitizeNum(pt.diskwrite),
      }))
      .slice(-70); // Last ~70 data points (1 hour at ~1min intervals)

    return Response.json({ ok: true, metrics, history } satisfies VMMetricsResponse);
  } catch (err) {
    console.error("[VM Metrics] Proxmox query failed:", err instanceof Error ? err.message : err);
    return Response.json(
      { ok: false, error: "Failed to retrieve metrics from infrastructure" },
      { status: 502 }
    );
  }
}

/** Clamp a percentage to 0–100 and round to 2 decimals */
function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(Math.min(100, Math.max(0, v)) * 100) / 100;
}

/** Sanitize a number: replace NaN/Infinity with 0 */
function sanitizeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
