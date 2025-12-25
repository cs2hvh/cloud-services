import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { Projects } from "@/lib/supabase/queries/projects";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { project_id, event, text } = body;

    // Validate required fields
    if (!project_id || !event || !text) {
      return NextResponse.json(
        { message: "project_id, event, and text are required" },
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

    // Check if user is owner or in users array
    const users = project.users as string[] | null;
    const isOwner = project.owner === user.id;
    const isMember = users?.includes(user.id) || false;

    if (!isOwner && !isMember) {
      return NextResponse.json(
        { message: "You don't have access to this project" },
        { status: 403 }
      );
    }

    // Add log entry
    const logAdded = await Projects.add_log({
      project_id,
      event,
      text,
    });

    if (!logAdded) {
      return NextResponse.json(
        { message: "Failed to add log entry" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "Log entry added successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("[addProjectLog] Error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
