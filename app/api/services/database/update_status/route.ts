import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/auth/server-auth";
import { validateRequest } from "@/lib/middleware/validate-request";
import { DatabaseService } from "@/lib/services/database-service";
import type { Database_Connection } from "@/lib/supabase/types";
import { updateStatusSchema } from "@/lib/validation/database";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Failed to update database status" },
      { status: 400 }
    );
  }

  try {
    const validation = validateRequest(updateStatusSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

    const result = await DatabaseService.updateStatus({
      clusterId: validatedData.id,
      publicConnection: validatedData.public_connection as Database_Connection,
      privateConnection: validatedData.private_connection as Database_Connection,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to update database status" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        data: result.data,
        message: "database updated successfully",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    console.error("[DatabaseUpdateStatus] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Failed to update database status" },
      { status: 400 }
    );
  }
}
