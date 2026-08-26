import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { destroyServer } from "@/lib/services/compute/server-lifecycle";
import { AuditLogService } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Full row for a per-server detail view. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const serverId = Number(id);
  if (!Number.isInteger(serverId)) {
    return NextResponse.json({ error: "Invalid server id" }, { status: 400 });
  }

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("servers")
    .select("*")
    .eq("id", serverId)
    .maybeSingle();

  if (error) {
    console.error("[Admin Servers] detail failed:", error.message);
    return NextResponse.json(
      { error: "Failed to load server" },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 });
  }
  return NextResponse.json({ data });
}

/**
 * Provider-aware delete via the shared destroyServer() path: tears down the
 * upstream instance (Linode delete / Proxmox stop+purge+route cleanup) AND
 * closes the billing meter. The main app's admin DELETE is Proxmox-only and
 * strands Linode instances + meters — do not copy that behavior.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const serverId = Number(id);
  if (!Number.isInteger(serverId)) {
    return NextResponse.json({ error: "Invalid server id" }, { status: 400 });
  }

  // Snapshot before destruction so the audit entry can name what was deleted.
  const supabase = await createServiceClient();
  const { data: before } = await supabase
    .from("servers")
    .select("id, name, provider, owner_email, location, status")
    .eq("id", serverId)
    .maybeSingle();

  const result = await destroyServer(serverId);

  try {
    await AuditLogService.create({
      user_id: admin.userId || "",
      user_email: admin.email,
      user_role: "admin",
      action: "delete",
      service_type: "compute",
      service_id: String(serverId),
      service_name: before?.name || `server ${serverId}`,
      metadata: {
        operation: "admin.server.destroy",
        provider: before?.provider,
        owner_email: before?.owner_email,
        location: before?.location,
        result,
      },
      user_agent: request.headers.get("user-agent") || undefined,
    });
  } catch {
    // audit must never fail the action
  }

  if (!result.success) {
    return NextResponse.json(
      { error: result.message || "Failed to delete server" },
      { status: 502 },
    );
  }
  return NextResponse.json({ message: "Server deleted", result });
}
