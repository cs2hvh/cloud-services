import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { createSpectrumAppSchema } from "@/lib/validation/spectrum";
import { createSpectrumApp } from "@/config/spectrum-functions";
import { Billing } from "@/lib/supabase/queries";
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

    // Billing: upfront and hourly (dummy values)
    const INITIAL_COST = 15;
    const HOURLY_RATE = 60;

    // Check & deduct before creating Spectrum app
    const ownerId = validation.data.owner_id;
    const hasBalance = await Billing.has_balance(ownerId, INITIAL_COST);
    if (!hasBalance) {
      const bal = await Billing.get_balance(ownerId);
      return NextResponse.json(
        { error: "Insufficient credits", balance: bal, required: INITIAL_COST },
        { status: 402 }
      );
    }

    try {
      await Billing.deduct(ownerId, INITIAL_COST);
    } catch (e: any) {
      return NextResponse.json(
        { error: "Credit deduction failed", details: e?.message ?? String(e) },
        { status: 500 }
      );
    }

    const result = await createSpectrumApp(validation.data, body.role);

    // Insert into billing.active_spectrum (use local row id as service_id)
    try {
      const serviceId = (result?.app?.id as string) || (result?.cloudflare?.id as string);
      if (serviceId) {
        await Billing.add_active_spectrum({ userId: ownerId, serviceId, hourlyRate: HOURLY_RATE });
      }
    } catch (e) {
      console.error("[billing] active_spectrum insert failed:", e);
    }
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
