import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { DatabaseService } from "@/lib/services/database-service";
import { listDbsSchema } from "@/lib/validation/database";
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
    const validation = validateRequest(listDbsSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

    const result = await DatabaseService.listDatabasesInternal({
      clusterId: validatedData.cluster_id,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Invalid request" },
        { status: 400 }
      );
    }

    const databases = Array.isArray(result.data) ? result.data : [];
    if (result.warning) {
      return NextResponse.json(
        {
          data: databases,
          message: "Databases fetched successfully (sync failed)",
          warning: result.warning,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        data: databases,
        message: "Databases fetched and synced successfully",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("[listDatabases] Error:", err);

    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
