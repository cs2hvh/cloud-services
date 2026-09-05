import { NextRequest, NextResponse } from "next/server";
import { deleteSpectrumApp } from "@/config/spectrum-functions";
import { logError, sanitizeError } from "@/lib/api/error-sanitizer";
import { checkAdminAuth } from "@/lib/auth/check-admin";

// Admission is the shared policy in lib/auth/check-admin (requireAdmin:
// ADMIN_EMAILS when set, otherwise user_profiles.roles, plus the second-factor
// and suspension checks). This file used to run its own roles-only query,
// which ignored ADMIN_EMAILS and both of those checks.

export async function POST(req: NextRequest) {
  // Check authentication
  const { authorized } = await checkAdminAuth();
  
  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  try {
    console.log("Admin spectrum app delete request received");
    const body = await req.json();
    const { spectrum_id } = body;
    console.log(spectrum_id, "...........spectrum_id to delete........");

    if (!spectrum_id) {
      return NextResponse.json(
        { error: "Invalid request", message: "Spectrum ID is required" },
        { status: 400 }
      );
    }

    // Delete the spectrum app using the spectrum functions
    const result = await deleteSpectrumApp(spectrum_id);

    if (!result || !result.id) {
      return NextResponse.json(
        {
          error: "Failed to delete spectrum app",
          message: "Delete operation failed",
        },
        { status: 500 }
      );
    }

    // ✅ SUCCESS RESPONSE
    return NextResponse.json(
      {
        success: true,
        message: result.message || "Spectrum app deleted successfully",
      },
      { status: 200 }
    );

  } catch (error) {
    logError("DELETE /api/admin/network-ddos/apps/delete", error);
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: sanitizeError(error),
      },
      { status: 500 }
    );
  }
}
