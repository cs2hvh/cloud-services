import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { ObjectStorageFunctions } from "@/config/object-storage-functions";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();
    const { bucket_id, force = true } = body;

    // ✅ VALIDATE REQUEST PAYLOAD
    if (!bucket_id || typeof bucket_id !== "string") {
      return NextResponse.json(
        { error: "Invalid request", message: "Bucket ID is required" },
        { status: 400 }
      );
    }

    // 🔒 SECURE: Use centralized function for bucket deletion
    // All sensitive operations are handled securely in the config layer
    const result = await ObjectStorageFunctions.deleteBucket({
      bucket_id,
      user_id: auth.user!.id,
      force,
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
    // Generic error handling - no sensitive details exposed
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: errorMessage,
      },
      { status: 500 }
    );
  }


}
