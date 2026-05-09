import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { listSpectrumApps } from "@/config/spectrum-functions";
import { limitByUser } from "@/lib/cooldown/userbased";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";

export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
     const rl = await limitByUser(auth.user!.id, {
       prefix: "rl:spectrum-list",
       limit: 30,
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
    logError("services/spectrum/apps/list", error);
    
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: sanitizeError(error),
      },
      { status: 500 }
    );
  }
}
