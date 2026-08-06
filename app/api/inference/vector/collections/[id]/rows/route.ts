/**
 * GET    /api/inference/vector/collections/[id]/rows — list rows in a collection
 * DELETE /api/inference/vector/collections/[id]/rows — bulk delete (by external_id list)
 *
 * For per-row delete by id see ./rows/[rowId]/route.ts.
 *
 * GET supports:
 *   ?limit=N (1-200, default 50)
 *   ?offset=N (default 0)
 *   ?q=<substring> (matches external_id ILIKE %q%)
 *
 * Embedding bytes are NOT returned — they're useless to the dashboard and
 * make the response 6-12KB per row. Caller gets id / external_id / content
 * preview / metadata / created_at.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authenticateUserFromHeader } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { resolveControlPlaneAuth } from "@/lib/inference/api-key-auth";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";

function isUuid(s: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(s);
}

const bulkDeleteSchema = z.object({
  external_ids: z.array(z.string().min(1).max(200)).min(1).max(500),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-vec-rows-list",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  const q = url.searchParams.get("q")?.trim() ?? "";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Verify collection belongs to org first — keeps the rows query simple
  const { data: collection } = await supabase
    .schema("inference")
    .from("vector_collections")
    .select("id, row_count")
    .eq("id", id)
    .eq("org_id", org.org_id)
    .maybeSingle<{ id: string; row_count: number }>();

  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }

  let query = supabase
    .schema("inference")
    .from("vector_rows")
    .select("id, external_id, content, metadata, created_at, updated_at", { count: "exact" })
    .eq("collection_id", collection.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (q) {
    query = query.ilike("external_id", `%${q}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[Inference Vector] rows list error:", error);
    return NextResponse.json({ error: "Failed to list rows" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    rows: (data ?? []).map((r) => ({
      ...r,
      // Trim content for the list view — full content is available via /rows/[rowId]
      content: r.content ? (r.content.length > 240 ? r.content.slice(0, 240) + "…" : r.content) : null,
    })),
    total: count ?? collection.row_count,
    limit,
    offset,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid collection id" }, { status: 400 });

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-vec-rows-delete",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };
  if (auth.via === "session" && org.role === "viewer") {
    return NextResponse.json({ error: "Viewers cannot delete rows" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = bulkDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation error", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Org check via collection row
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

  const { error, count } = await supabase
    .schema("inference")
    .from("vector_rows")
    .delete({ count: "exact" })
    .eq("collection_id", collection.id)
    .in("external_id", parsed.data.external_ids);

  if (error) {
    console.error("[Inference Vector] rows bulk delete error:", error);
    return NextResponse.json({ error: "Failed to delete rows" }, { status: 500 });
  }

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: org.org_id,
    // Null for an API key — there is no human in the request. `via` and
    // `api_key_id` below are what make the entry attributable instead.
    actorUserId: auth.userId,
    action: "vector_rows.deleted",
    targetType: "vector_collection",
    targetId: collection.id,
    metadata: {
      via: auth.via,
      api_key_id: auth.apiKey?.keyId ?? null,
      collection_name: collection.name,
      deleted: count ?? 0,
      requested: parsed.data.external_ids.length,
    },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({ success: true, deleted: count ?? 0 });
}
