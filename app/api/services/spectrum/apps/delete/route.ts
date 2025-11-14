import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { validateRequest } from "@/lib/middleware/validate-request";
import { deleteSpectrumAppSchema } from "@/lib/validation/spectrum";
import { deleteSpectrumApp } from "@/config/spectrum-functions";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await req.json();
    const validation = validateRequest(deleteSpectrumAppSchema, body);
    if (!validation.success) return validation.response;

    const result = await deleteSpectrumApp(validation.data.app_id);
    return NextResponse.json(result, { status: 200 });
  } catch (err: any) {
    const msg = err?.response?.data?.errors?.[0]?.message || err?.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
