import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { validateRequest } from "@/lib/middleware/validate-request";
import { deleteSpectrumAppSchema } from "@/lib/validation/spectrum";
import { deleteSpectrumApp } from "@/config/spectrum-functions";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Spectrum_Apps } from "@/lib/supabase/queries/spectrum_apps";
import { Billing } from "@/lib/supabase/queries/billing";
import { requireAdmin } from "@/lib/supabase/auth";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  const {ok: authorized}=await requireAdmin();
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
    const validation = validateRequest(deleteSpectrumAppSchema, body);
    if (!validation.success) return validation.response;

    const appRecord = await Spectrum_Apps.get(validation.data.app_id);
    if (!appRecord.success || !appRecord.data) {
      return NextResponse.json(
        { error: "Spectrum app not found" },
        { status: 404 }
      );
    }

    if (!authorized && appRecord.data.owner_id !== auth.user!.id) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }

    // Close billing for spectrum app
    try {
      console.log(`[deleteSpectrumApp] Closing billing`, { userId: auth.user!.id, serviceId: validation.data.app_id });
      const billingResult = await Billing.close_active_service("spectrum", {
        userId: auth.user!.id,
        serviceId: validation.data.id,
        failOnInsufficient: false,
      });
      console.log(`[deleteSpectrumApp] Billing closed`, billingResult);
    } catch (billErr: unknown) {
      console.warn(`[deleteSpectrumApp] Billing close failed: ${billErr instanceof Error ? billErr.message : String(billErr)}`);
    }

    const result = await deleteSpectrumApp(validation.data.app_id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    console.error("Spectrum app delete error:", errorMessage);
    
    return NextResponse.json(
      {
        error: "Request processing failed",
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
