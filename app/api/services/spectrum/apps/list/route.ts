import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { listSpectrumApps } from "@/config/spectrum-functions";
import { limitByUser } from "@/lib/cooldown/userbased";

export async function GET() {
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
    const result = await listSpectrumApps(auth.user?.id);
    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("Spectrum app list error:", errorMessage);
    
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
