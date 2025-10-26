import { NextRequest, NextResponse } from "next/server";
import { Database_Clusters } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";

export async function PUT(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();

    // Validate required fields
    if (!body.cluster_id || !body.project_id) {
      return NextResponse.json(
        { error: "cluster_id and project_id are required" },
        { status: 400 }
      );
    }

    // Update project assignment in Supabase
    const result = await Database_Clusters.update_project(
      body.cluster_id,
      body.project_id
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to update project" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: "Project updated successfully",
        data: result.data,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("Project update error:", err);

    if (err instanceof Error) {
      return NextResponse.json(
        { error: err.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Unknown error occurred" },
      { status: 500 }
    );
  }
}
