import { createClient } from "@/lib/supabase/server";
import { ProjectService } from "@/lib/services/project-service";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { name, description } = await req.json();
    const supabase = await createClient();

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const result = await ProjectService.createProject({
      userId: user.id,
      payload: {
        name,
        description: description ?? undefined,
      },
      addLog: false,
    });

    if (!result.success) {
      console.error("[POST /projects]", result.error);
      return NextResponse.json({ message: result.error }, { status: 500 });
    }

    return NextResponse.json(
      {
        message: "Project created successfully",
        id: result.data.id,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /projects]", error);
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
