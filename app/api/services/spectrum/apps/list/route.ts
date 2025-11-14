import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { authenticateUser } from "@/lib/auth/server-auth";
import { Spectrum_Apps } from "@/lib/supabase/queries";
import { Encryption } from "@/config/functions";

export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    const token = process.env.CLOUDFLARE_API_TOKEN;
    if (!zoneId || !token) {
      return NextResponse.json(
        { error: "Cloudflare configuration missing" },
        { status: 500 },
      );
    }

    const cfResp = await axios.get(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/spectrum/apps`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!cfResp.data?.success) {
      return NextResponse.json(
        { error: cfResp.data?.errors?.[0]?.message || "Failed to list Spectrum apps" },
        { status: 400 },
      );
    }

    // Local list for owner context (optional - could filter by auth user id)
    const localRaw = await Spectrum_Apps.list_by_owner(auth.user?.id || "");
    const encKey = process.env.ENCRYPTION_KEY!;
    const local = localRaw.map(app => {
      let ip: string | null = null;
      try {
        if (app.hostname_enc) ip = Encryption.decrypt(app.hostname_enc as any, encKey);
      } catch {}
      return { ...app, ip };
    });
    return NextResponse.json({ cf: cfResp.data.result, local });
  } catch (err: any) {
    const msg = err?.response?.data?.errors?.[0]?.message || err?.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
