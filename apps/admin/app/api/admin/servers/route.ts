import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const STATUSES = [
  "provisioning",
  "running",
  "stopped",
  "suspended",
  "failed",
  "error",
];
const PROVIDERS = ["linode", "proxmox"];
const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;

function sanitizeSearchTerm(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9@._\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fleet list with search / filters / pagination — replaces the main app's
 * unpaginated `select("*")` admin servers list.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") || "25", 10) || 25),
  );
  const search = sanitizeSearchTerm(searchParams.get("search") || "");
  const status = searchParams.get("status") || "";
  const provider = searchParams.get("provider") || "";
  const region = searchParams.get("region") || "";

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    const supabase = await createServiceClient();

    let query = supabase
      .from("servers")
      .select(
        "id, name, ip, provider, linode_id, vmid, node, location, plan_slug, os, cpu_cores, memory_mb, disk_gb, status, owner_id, owner_email, hourly_cost, monthly_cost, created_at",
        { count: "exact" },
      );

    if (search) {
      if (IPV4.test(search)) {
        query = query.eq("ip", search);
      } else {
        query = query.or(
          `name.ilike.%${search}%,owner_email.ilike.%${search}%,os.ilike.%${search}%`,
        );
      }
    }
    if (STATUSES.includes(status)) query = query.eq("status", status);
    if (PROVIDERS.includes(provider)) query = query.eq("provider", provider);
    if (region) query = query.eq("location", region);

    const [{ data, error, count }, { data: hosts }, { data: linodeRegions }] =
      await Promise.all([
        query.order("created_at", { ascending: false }).range(from, to),
        supabase.from("proxmox_hosts").select("id, name, region, display_region"),
        supabase.from("linode_regions").select("id, label"),
      ]);

    if (error) {
      console.error("[Admin Servers] list failed:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch servers" },
        { status: 500 },
      );
    }

    // location is a proxmox host id or a Linode region id — attach a label.
    const hostLabel = new Map(
      (hosts ?? []).map((h) => [
        h.id,
        h.display_region || h.region || h.name || h.id,
      ]),
    );
    const linodeRegionLabel = new Map(
      (linodeRegions ?? []).map((r) => [r.id, r.label || r.id]),
    );
    const rows = (data ?? []).map((s) => ({
      ...s,
      region_label: !s.location
        ? null
        : s.provider === "linode"
          ? linodeRegionLabel.get(s.location) || s.location
          : hostLabel.get(s.location) || s.location,
    }));

    return NextResponse.json({
      data: rows,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (err) {
    console.error("[Admin Servers] unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
