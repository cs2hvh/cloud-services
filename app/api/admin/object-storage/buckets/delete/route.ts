import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { ObjectSpaces } from "@/lib/supabase/queries";
import { ObjectStorageFunctions } from "@/config/object-storage-functions";
import { createClient } from "@/lib/supabase/server";


// Helper function to check if user is admin
async function checkAdminAuth() {
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

    return NextResponse.json(
      {
        success: true,
        message: "Bucket deleted successfully",
      },
      { status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("Admin bucket delete error:", errorMessage);
    
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}