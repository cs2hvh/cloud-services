import { NextResponse } from "next/server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Lightweight balance read for the dashboard header (session-auth). Reads only
// the credit_balance row — no promo-table scan — so it's cheap to poll.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const service = await createServiceClient();
    const { data } = await service
      .schema("billing")
      .from("user_credits")
      .select("credit_balance")
      .eq("user_id", user.id)
      .maybeSingle();

    return NextResponse.json({ ok: true, balance: Number(data?.credit_balance ?? 0) });
  } catch {
    return NextResponse.json({ ok: true, balance: 0 });
  }
}
