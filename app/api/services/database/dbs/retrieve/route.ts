import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { DatabaseService } from "@/lib/services/database-service";
import { retrieveDbSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const validation = validateRequest(retrieveDbSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

    const result = await DatabaseService.retrieveDatabaseInternal({
      clusterId: validatedData.cluster_id,
      name: validatedData.name,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Invalid request" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        data: result.data,
        message: "Database retrieved successfully",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("[retrieveDatabase] Error:", err);

    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
