import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteSpectrumApp } from "@/config/spectrum-functions";

// Helper function to check if user is admin
export async function checkAdminAuth() {
  const supabase = await createClient();
  
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { authorized: false, user: null };
  }

  // Get user profile to check roles
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("roles")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.roles?.includes("admin");

  return { authorized: isAdmin, user };
}

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
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("Admin spectrum app delete error:", errorMessage);
    
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
