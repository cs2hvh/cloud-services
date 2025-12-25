import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { Projects } from "@/lib/supabase/queries/projects";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const project_id = searchParams.get("project_id");

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

    // Get logs
    const logs = await Projects.get_logs(project_id);

    if (!logs) {
      return NextResponse.json(
        { message: "Failed to fetch logs" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { data: logs, message: "Logs fetched successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("[getProjectLogs] Error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
