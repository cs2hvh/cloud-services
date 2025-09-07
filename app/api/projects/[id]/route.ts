import { createClient } from "@/lib/supabase/server";
import { Projects } from "@/lib/supabase/queries";
import { projectSchema } from "@/types/zod/project";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  try {
    // Check if user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = projectSchema.parse(body);

    // Update project
    const updated = await Projects.update(id, parsed);
    if (!updated) {
      return NextResponse.json(
        { message: "Failed to update project" },
        { status: 500 },
      );
    }

    // Add log entry
    const logAdded = await Projects.add_log({
      event: "Settings",
      text: `Updated fields: ${Object.keys(parsed).join(", ")}`,
      project_id: id,
    });

    if (!logAdded) {
      console.warn("Failed to add project log");
    }

    return NextResponse.json({ message: "Project updated successfully" });
  } catch (error) {
    console.error("[PATCH /projects/:id]", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  try {
    // Check if user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { event, users } = body as {
      event: "add" | "remove";
      users: string[];
    };

    if (!["add", "remove"].includes(event) || !Array.isArray(users)) {
      return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
    }

    // Get current project data
    const project = await Projects.get_by_id(id);
    if (!project) {
      return NextResponse.json(
        { message: "Project not found" },
        { status: 404 },
      );
    }

    let currentUsers: string[] = [];
    try {
      currentUsers = Array.isArray(project.users)
        ? (project.users as string[])
        : JSON.parse((project.users as string) || "[]");
    } catch (err) {
      console.warn("Invalid JSON in existing users field", err);
      currentUsers = [];
    }

    let updatedUsers: string[];

    if (event === "add") {
      const set = new Set([...currentUsers, ...users]);
      updatedUsers = Array.from(set);
    } else {
      updatedUsers = currentUsers.filter((u) => !users.includes(u));
    }

    const updated = await Projects.update(id, { users: updatedUsers });
    if (!updated) {
      return NextResponse.json(
        { message: "Failed to update project users" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      message: `Users ${event === "add" ? "added to" : "removed from"} project.`,
      users: updatedUsers,
    });
  } catch (err) {
    console.error("[PUT /projects/:id/users]", err);
    return NextResponse.json(
      { message: "Failed to update project users." },
      { status: 500 },
    );
  }
}
