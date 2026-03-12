import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/auth/server-auth";
import { DatabaseService } from "@/lib/services/database-service";

export async function PUT(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = (await req.json()) as {
      cluster_id?: string;
      project_id?: string;
    };

    if (!body.cluster_id || !body.project_id) {
      return NextResponse.json(
        { error: "cluster_id and project_id are required" },
        { status: 400 }
      );
    }

    const result = await DatabaseService.updateClusterProject(
      {
        clusterId: body.cluster_id,
        projectId: body.project_id,
        userId: auth.user.id,
      },
      req,
      auth.user?.email
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to update project" },
        { status: result.statusCode || 500 }
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
