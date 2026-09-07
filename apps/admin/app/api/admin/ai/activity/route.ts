import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The inference control-plane activity log (inference.audit_log) — key
 * creation and revocation, model repricing, org limit changes, BYOK
 * additions, connector and vector edits. This is a different trail from the
 * platform-wide audits.audit_logs: this one records what happened INSIDE
 * the AI gateway, written by the gateway itself.
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
  const days = Math.min(
    365,
    Math.max(1, parseInt(searchParams.get("days") || "90", 10) || 90),
  );
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(
    200,
    Math.max(10, parseInt(searchParams.get("limit") || "50", 10) || 50),
  );
  const action = searchParams.get("action") || "";
  const targetType = searchParams.get("target") || "";
  const orgId = searchParams.get("org") || "";
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const supabase = await createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inference = (supabase as any).schema("inference");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyFilters = (b: any) => {
      let q = b.gte("created_at", since);
      if (action) q = q.eq("action", action);
      if (targetType) q = q.eq("target_type", targetType);
      if (orgId) q = q.eq("org_id", orgId);
      return q;
    };

    const from = (page - 1) * limit;
    const [rowsRes, countRes, orgsRes, keysRes] = await Promise.all([
      applyFilters(
        inference
          .from("audit_log")
          .select(
            "id, org_id, actor_user_id, actor_api_key_id, action, target_type, target_id, metadata, ip_address, created_at",
          ),
      )
        .order("created_at", { ascending: false })
        .range(from, from + limit - 1),
      applyFilters(
        inference.from("audit_log").select("id", { count: "exact", head: true }),
      ),
      inference.from("orgs").select("id, slug, name"),
      inference.from("api_keys").select("id, name, key_prefix, key_last_four"),
    ]);

    if (rowsRes.error) {
      console.error("[Admin AI] activity query failed:", rowsRes.error.message);
      return NextResponse.json(
        { error: "Failed to load activity log" },
        { status: 500 },
      );
    }

    const rows = (rowsRes.data ?? []) as Record<string, unknown>[];

    const userIds = [
      ...new Set(
        rows
          .map((r) => r.actor_user_id as string | null)
          .filter((v): v is string => Boolean(v)),
      ),
    ];
    const profiles =
      userIds.length > 0
        ? await supabase
            .from("user_profiles")
            .select("id, username, display_name")
            .in("id", userIds)
        : { data: [] };
    const nameOf = new Map<string, string>(
      (profiles.data ?? []).map((p) => [
        p.id as string,
        ((p.display_name as string | null) ??
          (p.username as string | null) ??
          "") as string,
      ]),
    );
    const orgOf = new Map<string, string>(
      (orgsRes.data ?? []).map((o: { id: string; slug: string; name: string }) => [
        o.id,
        o.name || o.slug,
      ]),
    );
    const keyOf = new Map<string, string>(
      (keysRes.data ?? []).map(
        (k: {
          id: string;
          name: string | null;
          key_prefix: string | null;
          key_last_four: string | null;
        }) => [k.id, k.name || `${k.key_prefix ?? "key"}…${k.key_last_four ?? ""}`],
      ),
    );

    return NextResponse.json({
      days,
      page,
      limit,
      total: countRes.error ? null : (countRes.count ?? 0),
      rows: rows.map((r) => {
        const uid = r.actor_user_id as string | null;
        const kid = r.actor_api_key_id as string | null;
        return {
          id: r.id as string,
          at: r.created_at as string,
          action: r.action as string,
          targetType: (r.target_type as string | null) ?? null,
          targetId: (r.target_id as string | null) ?? null,
          org: r.org_id
            ? { id: r.org_id as string, label: orgOf.get(r.org_id as string) ?? "—" }
            : null,
          // An action is either a person's or a key's — say which, rather
          // than collapsing both into one "actor" that hides the difference.
          actor: uid
            ? { kind: "user" as const, label: nameOf.get(uid) || `${uid.slice(0, 8)}…` }
            : kid
              ? { kind: "key" as const, label: keyOf.get(kid) ?? `${kid.slice(0, 8)}…` }
              : { kind: "system" as const, label: "system" },
          ip: (r.ip_address as string | null) ?? null,
          metadata: (r.metadata as Record<string, unknown> | null) ?? null,
        };
      }),
    });
  } catch (err) {
    console.error("[Admin AI] activity unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
