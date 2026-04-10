import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { validateRequest } from "@/lib/middleware/validate-request";
import { getSpectrumAppSchema } from "@/lib/validation/spectrum";
import { getSpectrumApp } from "@/config/spectrum-functions";
import { limitByUser } from "@/lib/cooldown/userbased";
import { requireAdmin } from "@/lib/supabase/auth";
import { Spectrum_Apps } from "@/lib/supabase/queries/spectrum_apps";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { ok: authorized } = await requireAdmin();

  try {
     const rl = await limitByUser(auth.user!.id, {
       prefix: "rl:spectrum-get",
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
    const rawBody = (await req.json()) as Record<string, unknown>;
    const body = {
      ...rawBody,
      owner_id:
        typeof rawBody.owner_id === "string"
          ? rawBody.owner_id
          : typeof rawBody.user_id === "string"
            ? rawBody.user_id
            : undefined,
    };
    const validation = validateRequest(getSpectrumAppSchema, body);
    if (!validation.success) return validation.response;

    const appRecord = await Spectrum_Apps.get(validation.data.app_id);
    if (!appRecord.success || !appRecord.data) {
      return NextResponse.json({ error: "Spectrum app not found" }, { status: 404 });
    }

    if (!authorized && appRecord.data.owner_id !== auth.user.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

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
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { errors?: Array<{ message?: string }> } }; message?: string }).response?.data?.errors?.[0]?.message ||
      (err instanceof Error ? err.message : null) ||
      "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
