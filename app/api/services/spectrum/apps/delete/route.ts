import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { validateRequest } from "@/lib/middleware/validate-request";
import { deleteSpectrumAppSchema } from "@/lib/validation/spectrum";
import { deleteSpectrumApp } from "@/config/spectrum-functions";
import { checkAdminAuth } from "@/app/api/admin/network-ddos/apps/delete/route";
import { limitByUser } from "@/lib/cooldown/userbased";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  const {authorized}=await checkAdminAuth();
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
      if (!authorized && auth.user.id !== body.owner_id) {
        return NextResponse.json(
          { error: "Unauthorized - Admin access required" },
          { status: 403 }
        );
      }
    const validation = validateRequest(deleteSpectrumAppSchema, body);
    if (!validation.success) return validation.response;

    const result = await deleteSpectrumApp(validation.data.app_id);
    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    const msg = err?.response?.data?.errors?.[0]?.message || err?.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
