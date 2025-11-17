import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

// Rate limiter: 3 unenrollment attempts per minute per user
const limiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});

type UnenrollRequestBody = {
  factorId?: string; // Optional: if not provided, will unenroll all verified factors
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Apply rate limiting
    try {
      await limiter.check(req, 3, user.id);
    } catch {
      return NextResponse.json(
        { error: "Too many unenrollment attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body: UnenrollRequestBody = await req.json();
    const { factorId } = body;

    // Get current factors
    const factors = await supabase.auth.mfa.listFactors();
    if (factors.error) {
      console.error("List factors error:", factors.error);
      return NextResponse.json(
        { error: factors.error.message },
        { status: 400 }
      );
    }

    // Determine which factor to unenroll
    let targetFactorId: string | null = null;

    if (factorId) {
      // Use provided factor ID
      const factor = factors.data.totp.find((f) => f.id === factorId);
      if (!factor) {
        return NextResponse.json(
          { error: "Factor not found" },
          { status: 404 }
        );
      }
      targetFactorId = factorId;
    } else {
      // Find verified factor to unenroll
      const verifiedFactor = factors.data.totp.find(
        (f) => f.status === "verified"
      );
      if (!verifiedFactor) {
        return NextResponse.json(
          { error: "No verified 2FA factor found to disable" },
          { status: 404 }
        );
      }
      targetFactorId = verifiedFactor.id;
    }

    // Unenroll the factor
    const unenroll = await supabase.auth.mfa.unenroll({
      factorId: targetFactorId,
    });

    if (unenroll.error) {
      if (unenroll.error.message.includes("rate limit")) {
        return NextResponse.json(
          { error: "Too many requests. Please wait a moment and try again." },
          { status: 429 }
        );
      }

      console.error("MFA unenroll error:", unenroll.error);
      return NextResponse.json(
        { error: unenroll.error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "2FA factor successfully removed",
    });
  } catch (error) {
    console.error("MFA unenrollment error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to unenroll MFA",
      },
      { status: 500 }
    );
  }
}
