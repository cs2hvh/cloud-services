import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { Activities } from "@/lib/supabase/queries";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const project_id = searchParams.get("project_id");
    const limit = searchParams.get("limit");
    const offset = searchParams.get("offset");

    if (!project_id) {
      return NextResponse.json(
        { message: "project_id is required" },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(project_id)) {
      return NextResponse.json(
        { message: "Invalid project_id format" },
        { status: 400 }
      );
    }

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

    // Get activities
    const parsedLimit = limit ? parseInt(limit, 10) : 50;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;

    const activities = await Activities.get_by_project_id(
      project_id,
      parsedLimit,
      parsedOffset
    );

    return NextResponse.json(
      {
        message: "Activities retrieved successfully",
        activities,
        count: activities.length,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[GET /api/projects/activity/read]", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
