import { NextRequest, NextResponse } from "next/server";

import { authenticateUser } from "@/lib/auth/server-auth";
import { DatabaseService } from "@/lib/services/database-service";
import { readNetworkSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();

    const validation = validateRequest(readNetworkSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

    const result = await DatabaseService.readNetworkRules(validatedData.id);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to read network rules" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        data: result.data,
        message: "network data fetched successfully",
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
