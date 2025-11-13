import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { ObjectSpaces } from "@/lib/supabase/queries";

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
    console.log("📖 Admin reading all buckets");

    // Get all buckets with user details for admin
    const buckets = await ObjectSpaces.get_all_for_admin();

    console.log(`✅ Retrieved ${buckets.length} buckets for admin`);

    return NextResponse.json(
      {
        success: true,
        data: buckets,
        count: buckets.length,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("❌ Error reading buckets for admin:", error);
    return NextResponse.json(
      {
        error: "Failed to read buckets",
        message: error.message,
      },
      { status: 500 }
    );
  }
}