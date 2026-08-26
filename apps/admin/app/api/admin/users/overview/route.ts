import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const WEEKS = 12;

/** User-base aggregates: totals + weekly signups. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, roles, suspend, two_factor_enabled, created_at")
      .limit(50000);

    if (error) {
      console.error("[Admin Users] overview failed:", error.message);
      return NextResponse.json(
        { error: "Failed to load overview" },
        { status: 500 },
      );
    }

    const rows = data ?? [];
    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

    const totals = {
      users: rows.length,
      admins: rows.filter((u) => u.roles?.includes("admin")).length,
      suspended: rows.filter((u) => u.suspend).length,
      twoFactor: rows.filter((u) => u.two_factor_enabled).length,
      new30d: rows.filter(
        (u) => now - new Date(u.created_at).getTime() < THIRTY_DAYS,
      ).length,
    };

    // Weekly signups, weeks starting Monday (UTC).
    const today = new Date();
    const monday = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    monday.setUTCDate(monday.getUTCDate() - ((today.getUTCDay() + 6) % 7));

    const signupSeries = [];
    for (let i = WEEKS - 1; i >= 0; i--) {
      const start = new Date(monday);
      start.setUTCDate(start.getUTCDate() - i * 7);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);
      signupSeries.push({
        week: `${start.getUTCMonth() + 1}/${start.getUTCDate()}`,
        count: rows.filter((u) => {
          const t = new Date(u.created_at).getTime();
          return t >= start.getTime() && t < end.getTime();
        }).length,
      });
    }

    return NextResponse.json({ totals, signupSeries });
  } catch (err) {
    console.error("[Admin Users] overview unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
