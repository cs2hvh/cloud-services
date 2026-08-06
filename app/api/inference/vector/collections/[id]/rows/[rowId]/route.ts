/**
 * GET    /api/inference/vector/collections/[id]/rows/[rowId] — full row including embedding
 * DELETE /api/inference/vector/collections/[id]/rows/[rowId] — single-row delete by uuid
 *
 * GET returns the embedding array — for inspection only; not meant for hot paths.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { resolveControlPlaneAuth } from "@/lib/inference/api-key-auth";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  const authResult = await resolveControlPlaneAuth(
    request,
    async () => {
      const a = await authenticateUserFromHeader(request);
      return a.authenticated
        ? { ok: true as const, userId: a.user!.id, email: a.user!.email ?? "" }
        : { ok: false as const, response: a.response };
    },
    async (userId) => {
      const o = await getActiveOrgForUser(userId);
      return o ? { org_id: o.org_id, role: o.role, org_name: o.org_name, org_slug: o.org_slug } : null;
    }
  );
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const { id, rowId } = await params;
  if (!isUuid(id) || !isUuid(rowId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const org = { org_id: auth.orgId, role: auth.orgRole };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Org check via the collection
  const { data: collection } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select("id")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string }>();

  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .schema("inference")
    .from("vector_rows")
    .select("id, external_id, content, metadata, embedding, created_at, updated_at")
    .eq("id", rowId)
    .eq("collection_id", collection.id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Row not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, row: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; rowId: string }> }
) {
  const authResult = await resolveControlPlaneAuth(
    request,
    async () => {
      const a = await authenticateUserFromHeader(request);
      return a.authenticated
        ? { ok: true as const, userId: a.user!.id, email: a.user!.email ?? "" }
        : { ok: false as const, response: a.response };
    },
    async (userId) => {
      const o = await getActiveOrgForUser(userId);
      return o ? { org_id: o.org_id, role: o.role, org_name: o.org_name, org_slug: o.org_slug } : null;
    }
  );
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const { id, rowId } = await params;
  if (!isUuid(id) || !isUuid(rowId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-vec-row-delete",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };
  if (auth.via === "session" && org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot delete rows" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: collection } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select("id, name")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string; name: string }>();

  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  // Fetch external_id for audit before deletion
  const { data: existing } = await supabase
    .schema("inference")
    .from("vector_rows")
    .select("external_id")
    .eq("id", rowId)
    .eq("collection_id", collection.id)
    .maybeSingle<{ external_id: string }>();

  const { error, count } = await supabase
    .schema("inference")
    .from("vector_rows")
    .delete({ count: "exact" })
    .eq("id", rowId)
    .eq("collection_id", collection.id);

  if (error) {
    console.error("[Inference Vector] row delete error:", error);
    return NextResponse.json({ error: "Failed to delete row" }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ error: "Row not found" }, { status: 404 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    // Null for an API key — there is no human in the request. `via` and
    // `api_key_id` below are what make the entry attributable instead.
    actorUserId: auth.userId,
    action: "vector_row.deleted",
    targetType: "vector_row",
    targetId: rowId,
    metadata: {
      via: auth.via,
      api_key_id: auth.apiKey?.keyId ?? null,
      collection_name: collection.name,
      external_id: existing?.external_id,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, deleted_id: rowId });
}
