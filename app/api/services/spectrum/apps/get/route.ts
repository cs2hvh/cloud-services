import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { validateRequest } from "@/lib/middleware/validate-request";
import { getSpectrumAppSchema } from "@/lib/validation/spectrum";
import { getSpectrumApp } from "@/config/spectrum-functions";
import { checkAdminAuth } from "@/lib/auth/check-admin";
import { limitByUser } from "@/lib/cooldown/userbased";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { authorized } = await checkAdminAuth();

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
    if (!authorized && auth.user.id !== body.user_id) {
      return NextResponse.json(
        { error: "Unauthorized - Admin access required" },
        { status: 403 }
      );
    }
    const validation = validateRequest(getSpectrumAppSchema, body);
    if (!validation.success) return validation.response;

    const result = await getSpectrumApp(validation.data.app_id);

    // Decrypt DNS name for local data
    const localWithDecryptedDns = result.local
      ? {
          ...result.local,
          dns:
            result.local.dns &&
            typeof result.local.dns === "object" &&
            "name" in result.local.dns
              ? {
                  ...(result.local.dns as Record<string, unknown>),
                  decrypted_name: result.decryptedIp,
                }
              : result.local.dns,
        }
      : null;

    return NextResponse.json({
      cloudflare: result.cloudflare,
      local: localWithDecryptedDns,
    });
  } catch (err: any) {
    const msg =
      err?.response?.data?.errors?.[0]?.message ||
      err?.message ||
      "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
