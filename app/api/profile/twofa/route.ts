import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Users } from "@/lib/supabase/queries";
import { rateLimit } from "@/lib/rate-limit";

// Rate limiter: 5 requests per minute per user
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

// Shape of accepted payload
type Update2FAStatusBody = {
  two_factor_enabled: boolean;
};

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Must be logged in
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Apply rate limiting per user
    try {
      await limiter.check(req, 5, user.id);
    } catch {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body: Update2FAStatusBody = await req.json();

    const { two_factor_enabled } = body;

    // Validate input
    if (typeof two_factor_enabled !== "boolean") {
      return NextResponse.json(
        { error: "Invalid two_factor_enabled value. Must be a boolean." },
        { status: 400 }
      );
    }

    // Update the user profile using the Users abstraction
    const updateResult = await Users.update(user.id, { 
      two_factor_enabled: two_factor_enabled
    });

    if (!updateResult) {
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `2FA ${two_factor_enabled ? 'enabled' : 'disabled'} successfully`
      },
      { status: 200 }
    );
  } catch (e: unknown) {
    const message =
      e instanceof Error ? e.message : "Failed to update 2FA status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}