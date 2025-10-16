import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  proxmoxAuth,
  getDispatcher,
  startVM,
  stopVM,
  rebootVM,
  waitTask,
  serializeError,
  type ProxmoxHost,
} from "@/lib/proxmox-utils";

export const dynamic = "force-dynamic";

interface PowerRequest {
  action: "start" | "stop" | "reboot";
  serverId: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<PowerRequest>;
    const { action, serverId } = body;

    // Validation
    if (!action || !["start", "stop", "reboot"].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "action must be 'start', 'stop', or 'reboot'" },
        { status: 400 }
      );
    }

    if (!serverId || typeof serverId !== "number") {
      return NextResponse.json(
        { ok: false, error: "serverId required and must be a number" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get server
    const { data: server, error: serverErr } = await supabase
      .from("servers")
      .select("vmid, node, location, status")
      .eq("id", serverId)
      .maybeSingle();

    if (serverErr || !server) {
      return NextResponse.json(
        { ok: false, error: "Server not found" },
        { status: 404 }
      );
    }

    if (!server.vmid) {
      return NextResponse.json(
        { ok: false, error: "Server has no VM ID" },
        { status: 400 }
      );
    }

    // Get Proxmox host
    const { data: hostData, error: hostErr } = await supabase
      .from("proxmox_hosts")
      .select("*")
      .eq("id", server.location)
      .eq("is_active", true)
      .maybeSingle();

    if (hostErr || !hostData) {
      return NextResponse.json(
        { ok: false, error: "Proxmox host not found" },
        { status: 404 }
      );
    }

    const host = hostData as unknown as ProxmoxHost;

    try {
      const dispatcher = getDispatcher(host.allow_insecure_tls);
      const auth = await proxmoxAuth(host, dispatcher);

      let taskId: string;
      const vmid = server.vmid as number;

      // Execute action
      switch (action) {
        case "start":
          taskId = await startVM(host, vmid, auth, dispatcher);
          break;
        case "stop":
          taskId = await stopVM(host, vmid, auth, dispatcher);
          break;
        case "reboot":
          taskId = await rebootVM(host, vmid, auth, dispatcher);
          break;
      }

      // Wait for task
      await waitTask(host, taskId, auth, dispatcher, 60000);

      // Update status
      const newStatus = action === "start" ? "running" : action === "stop" ? "stopped" : "running";

      const { error: updateErr } = await supabase
        .from("servers")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", serverId);

      if (updateErr) {
        console.error("Failed to update status:", updateErr);
      }

      return NextResponse.json({
        ok: true,
        serverId,
        vmid,
        action,
        status: newStatus,
        taskId,
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("Power action failed:", err);

      // Update to error status
      await supabase
        .from("servers")
        .update({
          status: "error",
          details: { error: err.message, action, timestamp: new Date().toISOString() },
        })
        .eq("id", serverId);

      return NextResponse.json(
        {
          ok: false,
          error: err.message,
          serverId,
          action,
          details: process.env.NODE_ENV === "development" ? serializeError(err) : undefined,
        },
        { status: 500 }
      );
    }
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Power request error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err.message || "Internal server error",
        details: process.env.NODE_ENV === "development" ? serializeError(err) : undefined,
      },
      { status: 500 }
    );
  }
}
