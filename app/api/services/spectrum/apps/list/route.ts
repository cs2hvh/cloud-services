import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { listSpectrumApps } from "@/config/spectrum-functions";

export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const result = await listSpectrumApps(auth.user?.id);
    return NextResponse.json(result);
  } catch (err: any) {
    const msg = err?.response?.data?.errors?.[0]?.message || err?.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
