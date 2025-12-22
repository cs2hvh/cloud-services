import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Billing } from "@/lib/supabase/queries/billing";

export async function POST(request: Request) {
  try {
    const { amount } = await request.json();
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    const supabase = await createClient();
    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id;
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const updated = await Billing.topup(userId, amount);
    return NextResponse.json({ ok: true, balance: updated.credit_balance });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
