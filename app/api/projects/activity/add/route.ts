import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { addActivitySchema } from "@/types/zod/activity";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Validate the request body
    const validationResult = addActivitySchema.safeParse(body);
    
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          message: "Validation failed", 
          errors: validationResult.error.errors 
        },
        { status: 400 }
      );
    }

    const { cluster_name, cluster_type, action, created_at, owner_id, project_id } = 
      validationResult.data;

    const supabase = await createClient();

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Verify the user has access to the project
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("owner, users")
      .eq("id", project_id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { message: "Project not found" },
        { status: 404 }
      );
    }

    // Check if user is the owner or in the users array
    const users = Array.isArray(project.users) 
      ? project.users 
      : [];
    
    const hasAccess = 
      project.owner === user.id || 
      users.includes(user.id);

    if (!hasAccess) {
      return NextResponse.json(
        { message: "You don't have access to this project" },
        { status: 403 }
      );
    }

    // Insert the activity
    const { data, error } = await supabase
      .from("activities")
      .insert({
        cluster_name,
        cluster_type,
        action,
        created_at: created_at || new Date().toISOString(),
        owner_id,
        project_id,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[POST /api/projects/activity/add]", error);
      return NextResponse.json(
        { message: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: "Activity added successfully",
        id: data.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/projects/activity/add]", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
