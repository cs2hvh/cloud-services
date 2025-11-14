import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { authenticateUser } from "@/lib/auth/server-auth";
import { validateRequest } from "@/lib/middleware/validate-request";
import { getSpectrumAppSchema } from "@/lib/validation/spectrum";
import { Spectrum_Apps } from "@/lib/supabase/queries";
import { Encryption } from "@/config/functions";

export async function POST(req: NextRequest) {
  // const auth = await authenticateUser();
  // if (!auth.authenticated) return auth.response;

  try {
    const body = await req.json();
    const validation = validateRequest(getSpectrumAppSchema, body);
    if (!validation.success) return validation.response;
    const { app_id } = validation.data;

    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!zoneId || !token) {
      return NextResponse.json(
        { error: "Cloudflare configuration missing" },
        { status: 500 },
      );
    }

    const cfResp = await axios.get(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/spectrum/apps/${app_id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!cfResp.data?.success) {
      return NextResponse.json(
        { error: cfResp.data?.errors?.[0]?.message || "Failed to fetch Spectrum app" },
        { status: 404 },
      );
    }

    // Local metadata
    const local = await Spectrum_Apps.get(app_id);
    let decrypted_ip: string | null = null;
    if (local.success && local.data?.hostname_enc) {
      try {
        const encKey = process.env.ENCRYPTION_KEY!;
        decrypted_ip = Encryption.decrypt(local.data.hostname_enc as any, encKey);
      } catch {}
    }
    return NextResponse.json({ cf: cfResp.data.result, local: local.success ? local.data : null, ip: decrypted_ip });
  } catch (err: any) {
    const msg = err?.response?.data?.errors?.[0]?.message || err?.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
