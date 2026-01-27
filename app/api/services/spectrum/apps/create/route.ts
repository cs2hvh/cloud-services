import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { createSpectrumAppSchema } from "@/lib/validation/spectrum";
import { NotificationService, createServiceNotification } from "@/lib/notifications";
import { createSpectrumApp } from "@/config/spectrum-functions";
import { ensureBalance } from "@/config/billing-flow";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getRatesForSpectrum } from "@/config/pricing";
import { AuditLogService, getAuditContext } from "@/lib/audit";
import { requireAdmin } from "@/lib/supabase/auth";

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


    console.log("reached here")

    // Billing: upfront and hourly (dynamic from admin pricing)
    const { initialCost: INITIAL_COST } = await getRatesForSpectrum();

    // Check balance BEFORE creating Spectrum app
    const ownerId = validation.data.owner_id;
    const balCheck = await ensureBalance(ownerId, INITIAL_COST);
    if (!balCheck.ok) {
      return NextResponse.json(
        { error: "Insufficient credits", balance: balCheck.balance, required: INITIAL_COST },
        { status: 402 }
      );
    }

    const result = await createSpectrumApp(validation.data, body.role);
     console.log("reached here")

    // Create audit log
    const auditContext = getAuditContext(req);
    const adminCheck = await requireAdmin();
    
    await AuditLogService.create({
      user_id: ownerId,
      user_role: adminCheck.ok ? 'admin' : 'user',
      user_email: auth.user?.email,
      action: 'create',
      service_type: 'network_ddos',
      service_id: result?.app?.id || result?.cloudflare?.id || 'unknown',
      service_name: validation.data.protocol || 'Spectrum App',
      after_state: result,
      ip_address: auditContext.ipAddress,
      user_agent: auditContext.userAgent,
      request_id: auditContext.requestId,
      metadata: {
        protocol: validation.data.protocol,
        initial_cost: INITIAL_COST,
      },
    });

    // Create notification
    await NotificationService.create(
      createServiceNotification({
        userId: ownerId,
        type: 'success',
        action: 'created',
        serviceType: 'network_ddos',
        serviceName: validation.data.protocol || 'Spectrum App',
        serviceId: result?.app?.id || result?.cloudflare?.id || 'unknown',
      })
    );

    // Insert into billing.active_spectrum (use local row id as service_id)
//     try {
//       const serviceId = (result?.app?.id as string) || (result?.cloudflare?.id as string);
//       if (serviceId) {
//         await postProvisionBilling({
//           userId: ownerId,
//           initialCost: INITIAL_COST,
//           hourlyRate: HOURLY_RATE,
//           serviceId,
//           addActive: Billing.add_active_spectrum,
//         });
//       }
//     } catch (e) {
//   const message =
//     e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);

//   return NextResponse.json(
//     {
//       error: "Post-provision billing failed",
//       details: message,
//     },
//     { status: 500 }
//   );
// }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    // Create error notification
    try {
      await NotificationService.create(
        createServiceNotification({
          userId: auth.user!.id,
          type: 'error',
          action: 'created',
          serviceType: 'network_ddos',
          serviceName: 'Spectrum App',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      );
    } catch (notifErr) {
      console.error('Failed to create error notification:', notifErr);
    }

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
