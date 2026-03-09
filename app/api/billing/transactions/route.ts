import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Billing } from "@/lib/supabase/queries/billing";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 100);
    const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);
    const offset = (page - 1) * limit;
    const status = url.searchParams.get("status") || undefined;
    const type = url.searchParams.get("type") || undefined;
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;

    const { transactions, total } = await Billing.get_transactions(userId, {
      limit,
      offset,
      status,
      type,
      from,
      to,
    });

    return NextResponse.json({
      success: true,
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    console.error("[Transactions] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}
