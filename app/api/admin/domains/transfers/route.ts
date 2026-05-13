import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createSSRClient, createServiceClient } from "@/lib/supabase/server";

async function buildUserEmailMap(userIds: string[]): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  try {
    const supabase = await createSSRClient();
    const { data } = await supabase.auth.admin.listUsers({ perPage: 1000, page: 1 });
    const map = new Map<string, string>();
    (data?.users ?? []).forEach((u) => {
      if (userIds.includes(u.id)) map.set(u.id, u.email ?? u.id);
    });
    return map;
  } catch {
    return new Map();
  }
}

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "";
  const search = url.searchParams.get("search")?.trim() || "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
  const from = (page - 1) * limit;

  const supabase = await createServiceClient();
  let query = supabase
    .from("domain_transfer_requests")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (status) query = query.eq("status", status);
  if (search) query = query.ilike("domain", `%${search}%`);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const emailMap = await buildUserEmailMap(userIds);

  const enriched = rows.map((r) => ({
    ...r,
    user_email: emailMap.get(r.user_id) ?? r.user_id,
  }));

  return NextResponse.json({ data: enriched, meta: { total: count ?? 0, page, limit } });
}
