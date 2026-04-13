import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { sanitizeAuthError, logError } from "@/lib/api/error-sanitizer";

// Rate limiter: 3 enrollments per minute per user
const limiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});

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
        { error: "Too many enrollment attempts. Please try again later." },
        { status: 429 }
      );
    }

    // Generate unique friendly name
    const friendlyName = `totp-${Date.now()}`;

    // Attempt enrollment
    let { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName,
    });

    // Handle existing factor conflicts
    if (
      enrollError?.message?.includes("already exists") ||
      enrollError?.message?.includes("factor") ||
      enrollError?.message?.includes("Maximum number of verified factors")
    ) {
      try {
        const factors = await supabase.auth.mfa.listFactors();
        if (!factors.error) {
          // Remove unverified factors
          for (const factor of factors.data.totp) {
            if (factor.status === "unverified") {
              await supabase.auth.mfa.unenroll({ factorId: factor.id });
            }
          }

          // If still hitting limit, remove oldest verified factor
          if (enrollError?.message?.includes("Maximum number of verified factors")) {
            const verifiedFactors = factors.data.totp.filter(
              (f) => f.status === "verified"
            );
            verifiedFactors.sort(
              (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime()
            );

            if (verifiedFactors.length > 0) {
              await supabase.auth.mfa.unenroll({
                factorId: verifiedFactors[0].id,
              });
            }
          }

          // Retry enrollment
          ({ data, error: enrollError } = await supabase.auth.mfa.enroll({
            factorType: "totp",
            friendlyName,
          }));
        }
      } catch (cleanupError) {
          logError("POST /api/auth/mfa/enroll cleanup", cleanupError);
        return NextResponse.json(
          {
            error: sanitizeAuthError(cleanupError),
          },
          { status: 500 }
        );
      }
    }

    if (enrollError) {
      logError("POST /api/auth/mfa/enroll", enrollError);
      return NextResponse.json(
        { error: sanitizeAuthError(enrollError) },
        { status: 400 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Failed to enroll MFA factor" },
        { status: 500 }
      );
    }

    // Format QR code as data URL if needed
    let qrUrl = data.totp.qr_code;
    if (qrUrl && !qrUrl.startsWith("data:")) {
      qrUrl = `data:image/svg+xml;utf-8,${encodeURIComponent(qrUrl)}`;
    }

    return NextResponse.json({
      success: true,
      factorId: data.id,
      qrCode: qrUrl,
      secret: data.totp.secret,
      uri: data.totp.uri,
    });
  } catch (error) {
    logError("POST /api/auth/mfa/enroll", error);
    return NextResponse.json(
      {
        error: sanitizeAuthError(error),
      },
      { status: 500 }
    );
  }
}
