import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/auth/server-auth";
import { DatabaseService } from "@/lib/services/database-service";
import { deleteDatabaseUserSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();

    const validation = validateRequest(deleteDatabaseUserSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    const result = await DatabaseService.deleteDatabaseUser(
      {
        clusterId: validatedData.cluster_id,
        username: validatedData.username,
        userId: auth.user.id,
        userEmail: auth.user?.email,
      },
      req
    );

    if (!result.success) {
      if (result.error === "User deleted from DigitalOcean but failed to sync with database") {
        return NextResponse.json(
          {
            error: "User deleted from DigitalOcean but failed to sync with database",
            details: result.error,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: result.error ?? "Invalid request" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        message: "Database user deleted successfully",
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
      { status: 400 }
    );
  }
}
