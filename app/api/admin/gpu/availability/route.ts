import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/supabase/auth";
import { getGpuDeployEnabled, setGpuDeployEnabled } from "@/lib/admin/platform-settings";

export const dynamic = "force-dynamic";

// GET — current GPU deployment availability (admin only).
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, enabled: await getGpuDeployEnabled() });
}

// POST { enabled: boolean } — flip the GPU "out of stock" switch (admin only).
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { enabled?: unknown };
  const enabled = body.enabled === true;
  await setGpuDeployEnabled(enabled, admin.userId);
  return NextResponse.json({ ok: true, enabled });
}
