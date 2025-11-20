import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { createSpectrumAppSchema } from "@/lib/validation/spectrum";
import { createSpectrumApp } from "@/config/spectrum-functions";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {

     const rl = await limitByUser(auth.user!.id, {
       prefix: "rl:bucket-create",
       limit: 3,
       windowMs: 60_000,
     });
     if (!rl.allowed) {
       return NextResponse.json(
         {
           error: "Too Many Requests",
           message: `Retry after ${rl.retryAfterSec}s`,
         },
         { status: 429 }
       );
     }



    const body = await req.json();
    const validation = validateRequest(createSpectrumAppSchema, body);
    if (!validation.success) return validation.response;

    const result = await createSpectrumApp(validation.data);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("Spectrum app create error:", errorMessage);
    
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
