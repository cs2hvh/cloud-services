import { NextRequest, NextResponse } from "next/server";
import { Database_Clusters } from "@/lib/supabase/queries";
import { authenticateUser } from "@/lib/auth/server-auth";
import { readNetworkSchema } from "@/lib/validation/database";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function POST(req: NextRequest) {
  // Check authentication
  const auth = await authenticateUser();
  if (!auth.authenticated) {
    return auth.response;
  }

  try {
    const body = await req.json();
    
    // Validate request body
    const validation = validateRequest(readNetworkSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const validatedData = validation.data;

      const supabase_read = await Database_Clusters.read(
        validatedData.id
      );
      
      if (supabase_read.success) {
        return NextResponse.json(
          {
            data: supabase_read.data.network_rules,
            //status:status,
            message: "network data fetched successfully",
          },
          { status: 200 }
        );
      }
    
    
  } catch (err: unknown) {
    if (err instanceof Error) {
      return NextResponse.json(
        { error: err.message ?? "Invalid request" },
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { error: "Unknown error occurred" },
        { status: 400 }
      );
    }
  }
}
