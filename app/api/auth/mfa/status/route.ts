import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
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
      console.error("Get AAL error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // List all factors
    const factors = await supabase.auth.mfa.listFactors();
    if (factors.error) {
      console.error("List factors error:", factors.error);
      return NextResponse.json(
        { error: factors.error.message },
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
    console.error("MFA status error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to get MFA status",
      },
      { status: 500 }
    );
  }
}
