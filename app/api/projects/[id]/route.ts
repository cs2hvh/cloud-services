import { createClient } from "@/lib/supabase/server";
import { ProjectService } from "@/lib/services/project-service";
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

    const updated = await ProjectService.updateProjectLegacy({
      projectId: id,
      payload: parsed,
    });
    if (!updated.success) {
      return NextResponse.json(
        { message: "Failed to update project" },
        { status: 500 },
      );
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

    const result = await ProjectService.updateProjectUsers({
      projectId: id,
      event,
      users,
    });

    if (!result.success && result.errorCode === "NOT_FOUND") {
      return NextResponse.json(
        { message: "Project not found" },
        { status: 404 },
      );
    }
    if (!result.success) {
      return NextResponse.json(
        { message: "Failed to update project users" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      message: `Users ${event === "add" ? "added to" : "removed from"} project.`,
      users: result.data,
    });
  } catch (err) {
    console.error("[PUT /projects/:id/users]", err);
    return NextResponse.json(
      { message: "Failed to update project users." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
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

    const deleted = await ProjectService.deleteProject({
      projectId: id,
      userId: user.id,
    });

    if (!deleted.success && deleted.errorCode === "NOT_FOUND") {
      return NextResponse.json(
        { message: "Project not found" },
        { status: 404 },
      );
    }

    if (!deleted.success && deleted.errorCode === "FORBIDDEN") {
      return NextResponse.json(
        { message: "You don't have permission to delete this project" },
        { status: 403 },
      );
    }

    if (!deleted.success) {
      return NextResponse.json(
        { message: "Failed to delete project" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      message: "Project deleted successfully",
    });
  } catch (error) {
    console.error("[DELETE /projects/:id]", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
