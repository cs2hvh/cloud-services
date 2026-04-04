import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { SupportTickets } from "@/lib/supabase/queries/support_tickets";
import { limitByUser } from "@/lib/cooldown/userbased";
import { adminSupportTicketsQuerySchema } from "@/lib/validation/support";

export const dynamic = "force-dynamic";

function tooManyRequestsResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Too Many Requests", message: `Retry after ${retryAfterSec}s` },
    { status: 429 }
  );
}

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok || !adminCheck.userId) {
    return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 });
  }

  const rl = await limitByUser(adminCheck.userId, {
    prefix: "rl:admin-support-tickets-list",
    limit: 90,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    return tooManyRequestsResponse(rl.retryAfterSec);
  }

  try {
    const url = new URL(request.url);
    const status = (url.searchParams.get("status") || "all").trim().toLowerCase();
    const topic = (url.searchParams.get("topic") || "").trim();
    const search = (url.searchParams.get("search") || "").trim();
    const parsed = adminSupportTicketsQuerySchema.safeParse({
      page: url.searchParams.get("page") || "1",
      limit: url.searchParams.get("limit") || "10",
      status,
      topic: topic.length > 0 ? topic : undefined,
      search: search.length > 0 ? search : undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid query parameters", details: parsed.error.errors }, { status: 400 });
    }

    const query = parsed.data;

    const result = await SupportTickets.listForAdmin({
      page: query.page,
      limit: query.limit,
      status: query.status,
      topic: query.topic,
      search: query.search,
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
