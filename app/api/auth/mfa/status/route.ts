import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeAuthError, logError } from "@/lib/api/error-sanitizer";

export async function GET() {
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

    // Get current AAL level
    const { data, error } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (error) {
      logError("GET /api/auth/mfa/status AAL", error);
      return NextResponse.json({ error: sanitizeAuthError(error) }, { status: 400 });
    }

    // List all factors
    const factors = await supabase.auth.mfa.listFactors();
    if (factors.error) {
      logError("GET /api/auth/mfa/status listFactors", factors.error);
      return NextResponse.json(
        { error: sanitizeAuthError(factors.error) },
        { status: 400 }
      );
    }

    // Find verified TOTP factor
    const verifiedTotp = factors.data.totp.find((f) => f.status === "verified");

    return NextResponse.json({
      currentLevel: data.currentLevel,
      nextLevel: data.nextLevel,
      hasVerifiedFactor: !!verifiedTotp,
      factorId: verifiedTotp?.id || null,
      factors: factors.data.totp.map((f) => ({
        id: f.id,
        status: f.status,
        factorType: f.factor_type,
        friendlyName: f.friendly_name,
        createdAt: f.created_at,
      })),
    });
  } catch (error) {
    logError("GET /api/auth/mfa/status", error);
    return NextResponse.json(
      {
        error: sanitizeAuthError(error),
      },
      { status: 500 }
    );
  }
}
