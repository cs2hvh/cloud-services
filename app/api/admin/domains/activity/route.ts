import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { AuditLogService } from "@/lib/audit";

export async function GET(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
  const search = url.searchParams.get("search")?.trim() || undefined;
  const userId = url.searchParams.get("user_id") || undefined;
  const serviceId = url.searchParams.get("service_id") || undefined;

  const { data, total } = await AuditLogService.query(
    { service_type: "domain", search, user_id: userId, service_id: serviceId },
    { page, limit }
  );

  return NextResponse.json({ data, meta: { total, page, limit } });
}
