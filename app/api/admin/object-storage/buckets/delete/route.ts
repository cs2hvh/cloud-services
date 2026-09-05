import { NextRequest, NextResponse } from "next/server";
import { ObjectStorageFunctions } from "@/config/object-storage-functions";
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
    console.log("Admin bucket delete request received");
    const body = await req.json();
    const { bucket_id } = body;
    console.log(bucket_id, "...........bucket_id to delete........");

    if (!bucket_id) {
      return NextResponse.json(
        { error: "Invalid request", message: "Bucket ID is required" },
        { status: 400 }
      );
    }

 const result = await ObjectStorageFunctions.deleteBucket({
   bucket_id,
   user_id: body.owner_id,
   force: true,
   is_admin: true,
 });

    // Handle result based on success/failure
    if (!result.success) {
      const statusCode = result.error === "Bucket not found" ? 404 : 
                        result.error === "Unauthorized" ? 403 : 500;
      
      return NextResponse.json(
        {
          error: result.error,
          message: result.message,
        },
        { status: statusCode }
      );
    }

    // ✅ SUCCESS RESPONSE
    return NextResponse.json(
      {
        success: true,
        message: result.message,
      },
      { status: 200 }
    );

  } catch (error) {
    logError("DELETE /api/admin/object-storage/buckets/delete", error);
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: sanitizeError(error),
      },
      { status: 500 }
    );
  }
}