import { Projects, Users } from "@/lib/supabase/queries";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { authorized } = await checkAdminAuth();

  if (!authorized) {
    return NextResponse.json(
      { error: "Unauthorized - Admin access required" },
      { status: 403 }
    );
  }

  try {
    const { userId } = await params;
    console.log("Fetching projects for userId:", userId);

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

   const userProfile = await Users.get_by_id(userId);
   if (!userProfile) {
     return NextResponse.json(
       { error: "User not found" },
       { status: 404 }
     );
   }

    // Get projects where user is owner or member
   const projects=await Projects.get_all_by_user(userId);


   console.log("Projects fetched:", projects);
   if (!projects) {
    
    return NextResponse.json({
      success: true,
      data: {
        user: userProfile,
        projects:[]
      }
    },{ status: 200 });
   }

   

    return NextResponse.json({
      success: true,
      data: {
        user: userProfile,
        projects: projects || []
      }
    },{ status: 200 });
  } catch (error) {
    console.error("[GET /users/projects/[userId]]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}