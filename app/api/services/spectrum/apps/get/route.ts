import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { validateRequest } from "@/lib/middleware/validate-request";
import { getSpectrumAppSchema } from "@/lib/validation/spectrum";
import { getSpectrumApp } from "@/config/spectrum-functions";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await req.json();
    const validation = validateRequest(getSpectrumAppSchema, body);
    if (!validation.success) return validation.response;

    const result = await getSpectrumApp(validation.data.app_id);
    
    // Decrypt DNS name for local data
    const localWithDecryptedDns = result.local ? {
      ...result.local,
      dns: result.local.dns && typeof result.local.dns === "object" && "name" in result.local.dns
        ? { ...(result.local.dns as Record<string, unknown>), decrypted_name: result.decryptedIp }
        : result.local.dns,
    } : null;

    return NextResponse.json({
      cloudflare: result.cloudflare,
      local: localWithDecryptedDns,
    });
  } catch (err: any) {
    const msg = err?.response?.data?.errors?.[0]?.message || err?.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
