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
    const { bucket_id, project_id } = body;

    if (!bucket_id) {
      return NextResponse.json(
        { error: "Invalid request", message: "Bucket ID is required" },
        { status: 400 }
      );
    }

    console.log("📁 Updating bucket project assignment:", bucket_id, "to project:", project_id);

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

    // Update project assignment in database
    const dbResult = await ObjectSpaces.update_bucket_settings(bucket.id, { 
      project_id: project_id || null 
    });

    if (!dbResult.success) {
      console.error("Failed to update project assignment in database:", dbResult.error);
      return NextResponse.json(
        {
          error: "Failed to update project assignment",
          message: dbResult.error,
        },
        { status: 500 }
      );
    }

    console.log("✅ Bucket project assignment updated successfully");

    return NextResponse.json(
      {
        success: true,
        message: "Bucket project assignment updated successfully",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("❌ Error updating bucket project assignment:", error);
    return NextResponse.json(
      {
        error: "Failed to update project assignment",
        message: error.message,
      },
      { status: 500 }
    );
  }
}