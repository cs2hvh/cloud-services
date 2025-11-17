import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Spectrum_Apps } from "@/lib/supabase/queries";

export async function GET(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  // Check if user is admin
  if (auth.user?.role !== 'admin') {
    return NextResponse.json(
      { error: "Unauthorized", message: "Admin access required" },
      { status: 403 }
    );
  }

  try {
    console.log("📖 Admin reading all spectrum apps");

    // Get all spectrum apps with user details for admin
    const apps = await Spectrum_Apps.get_all_for_admin();

    console.log(`✅ Retrieved ${apps.length} spectrum apps for admin`);

    return NextResponse.json(
      {
        success: true,
        data: apps,
        count: apps.length,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("❌ Error reading spectrum apps for admin:", error);
    return NextResponse.json(
      {
        error: "Failed to read spectrum apps",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
