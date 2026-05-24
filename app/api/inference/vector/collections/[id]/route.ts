/**
 * GET    /api/inference/vector/collections/[id] — details + stats
 * DELETE /api/inference/vector/collections/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select("*")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Collection not found in this org" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });

  const rl = await limitByUser(auth.user!.id, {
    prefix: "rl:inf-vec-delete",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = await getActiveOrgForUser(auth.user!.id);
  if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
  if (org.role !== "owner" && org.role !== "admin") {
    return NextResponse.json(
      { error: "Only org owners and admins can delete collections" },
      { status: 403 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Fetch name for audit before deleting
  const { data: existing } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select("name")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ name: string }>();

  // ON DELETE CASCADE on vector_rows handles row cleanup
  const { error, count } = await supabase
    .schema("inference")
    .from("vector_collections")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("org_id", org.org_id);

  if (error) {
    console.error("[Inference Vector] delete error:", error);
    return NextResponse.json({ error: "Failed to delete collection" }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    actorUserId: auth.user!.id,
    action: "collection.deleted",
    targetType: "vector_collection",
    targetId: id,
    metadata: { name: existing?.name },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, deleted_id: id });
}
