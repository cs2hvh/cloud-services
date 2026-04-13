import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeAuthError, logError } from "@/lib/api/error-sanitizer";

// Rate limiter: 10 verification attempts per minute per user
const limiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});

type VerifyRequestBody = {
  factorId: string;
  code: string;
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
      await limiter.check(req, 10, user.id);
    } catch {
      return NextResponse.json(
        { error: "Too many verification attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body: VerifyRequestBody = await req.json();
    const { factorId, code } = body;

    // Validate input
    if (!factorId || typeof factorId !== "string") {
      return NextResponse.json(
        { error: "Invalid factorId" },
        { status: 400 }
      );
    }

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json(
        { error: "Invalid verification code. Must be 6 digits." },
        { status: 400 }
      );
    }

    // Create challenge
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) {
        logError("POST /api/auth/mfa/verify challenge", challenge.error);
      return NextResponse.json(
        { error: sanitizeAuthError(challenge.error) },
        { status: 400 }
      );
    }

    // Verify code
    const verify = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: code.trim(),
    });

    if (verify.error) {
      // Provide user-friendly error messages
      if (verify.error.message.includes("Invalid TOTP code")) {
        return NextResponse.json(
          {
            error:
              "Invalid code. Make sure your device's clock is synchronized and try again.",
          },
          { status: 400 }
        );
      }
      
        logError("POST /api/auth/mfa/verify", verify.error);
      return NextResponse.json(
        { error: sanitizeAuthError(verify.error) },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "2FA verification successful",
    });
  } catch (error) {
    logError("POST /api/auth/mfa/verify", error);
    return NextResponse.json(
      {
        error: sanitizeAuthError(error),
      },
      { status: 500 }
    );
  }
}
