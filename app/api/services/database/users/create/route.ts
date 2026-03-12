import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/auth/server-auth";
import { DatabaseService } from "@/lib/services/database-service";
import { createDatabaseUserSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();

    const validation = validateRequest(createDatabaseUserSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const validatedData = validation.data;

    const result = await DatabaseService.createDatabaseUser(
      {
        clusterId: validatedData.cluster_id,
        name: validatedData.name,
        userId: auth.user.id,
      },
      req,
      auth.user?.email
    );

    if (!result.success) {
      if (result.error === "User created in DigitalOcean but failed to sync with database") {
        return NextResponse.json(
          {
            error: "User created in DigitalOcean but failed to sync with database",
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
        data: result.data,
        message: "Database user created successfully",
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
