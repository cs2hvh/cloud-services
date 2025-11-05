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
    const { bucket_id } = body;

    if (!bucket_id || typeof bucket_id !== 'string') {
      return NextResponse.json(
        { error: "Invalid request", message: "Bucket ID is required" },
        { status: 400 }
      );
    }

    console.log("📖 Reading bucket:", bucket_id);

    // Get bucket from database
    const bucket = await ObjectSpaces.get_bucket_by_bucket_id(bucket_id);

    if (!bucket) {
      return NextResponse.json(
        { error: "Bucket not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (bucket.owner_id !== auth.user!.id) {
      return NextResponse.json(
        { error: "Unauthorized", message: "You don't have access to this bucket" },
        { status: 403 }
      );
    }

    // Return bucket details
    return NextResponse.json(
      {
        success: true,
        data: bucket,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("❌ Error reading bucket:", error);
    return NextResponse.json(
      {
        error: "Failed to read bucket",
        message: error.message,
      },
      { status: 500 }
    );
  }
}
