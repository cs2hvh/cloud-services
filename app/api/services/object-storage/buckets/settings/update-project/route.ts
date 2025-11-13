import { NextRequest, NextResponse } from "next/server";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { updateBucketProjectSchema } from "@/lib/validation/object-storage";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const rl = await limitByUser(auth.user!.id, { prefix: "rl:bucket-settings", limit: 20, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }
    const body = await req.json();
    const parsed = validateRequest(updateBucketProjectSchema, body);
    if (!parsed.success) return parsed.response;
    const { bucket_id, project_id } = parsed.data as any;

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
    const dbResult = await ObjectSpaces.update_bucket_settings(bucket.id as string, { 
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