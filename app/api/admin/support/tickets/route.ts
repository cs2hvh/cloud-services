import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { SUPPORT_STATUS_LABELS, SupportTicketStatus } from "@/lib/support/catalog";
import { SupportTickets } from "@/lib/supabase/queries/support_tickets";

export const dynamic = "force-dynamic";

const VALID_STATUS_FILTERS = new Set<string>(["all", ...Object.keys(SUPPORT_STATUS_LABELS)]);

export async function GET(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) {
    return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get("limit") || "10", 10)));
    const statusParam = (url.searchParams.get("status") || "all").toLowerCase();
    const topic = (url.searchParams.get("topic") || "").trim();
    const search = (url.searchParams.get("search") || "").trim();

    if (!VALID_STATUS_FILTERS.has(statusParam)) {
      return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
    }

    const result = await SupportTickets.listForAdmin({
      page,
      limit,
      status: statusParam as SupportTicketStatus | "all",
      topic: topic.length > 0 ? topic : undefined,
      search: search.length > 0 ? search : undefined,
    });

    return NextResponse.json({
      success: true,
      data: result.tickets,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("[Admin SupportTickets API] GET failed:", error);
    return NextResponse.json({ error: "Failed to fetch support tickets" }, { status: 500 });
  }
}
