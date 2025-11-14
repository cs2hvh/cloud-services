import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { authenticateUser } from "@/lib/auth/server-auth";
import { validateRequest } from "@/lib/middleware/validate-request";
import { deleteSpectrumAppSchema } from "@/lib/validation/spectrum";
import { Spectrum_Apps, Projects } from "@/lib/supabase/queries";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await req.json();
    const validation = validateRequest(deleteSpectrumAppSchema, body);
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

    const cfResp = await axios.delete(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/spectrum/apps/${app_id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!cfResp.data?.success) {
      return NextResponse.json(
        { error: cfResp.data?.errors?.[0]?.message || "Failed to delete Spectrum app" },
        { status: 400 },
      );
    }

    const localBefore = await Spectrum_Apps.get(app_id);
    const del = await Spectrum_Apps.delete(app_id);

    if (!del.success) {
      return NextResponse.json(
        { error: "Deleted in Cloudflare but failed to remove locally", details: del.error },
        { status: 500 },
      );
    }

    const project_id = (localBefore.success && (localBefore as any).data?.project_id) || null;
    if (project_id) {
      await Projects.add_log?.({
        project_id,
        event: "SpectrumDelete",
        text: `Spectrum app '${(localBefore as any).data?.name || app_id}' deleted`,
      });
    }

    return NextResponse.json({ id: app_id, message: "Spectrum app deleted" }, { status: 200 });
  } catch (err: any) {
    const msg = err?.response?.data?.errors?.[0]?.message || err?.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
