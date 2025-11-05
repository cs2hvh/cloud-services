import { NextRequest, NextResponse } from "next/server";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();
    const { owner_id } = body;

    // Verify user can only request their own buckets
    if (owner_id !== auth.user!.id) {
      return NextResponse.json(
        { error: "Unauthorized", message: "You can only view your own buckets" },
        { status: 403 }
      );
    }

    console.log("📖 Reading all buckets for user:", owner_id);

    // Get all buckets for user
    const buckets = await ObjectSpaces.get_buckets(owner_id);

    return NextResponse.json(
      {
        success: true,
        data: buckets,
        count: buckets.length,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("❌ Error reading buckets:", error);
    return NextResponse.json(
      {
        error: "Failed to read buckets",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
