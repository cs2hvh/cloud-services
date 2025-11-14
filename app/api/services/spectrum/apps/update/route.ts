import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { validateRequest } from "@/lib/middleware/validate-request";
import { updateSpectrumAppSchema } from "@/lib/validation/spectrum";
import { updateSpectrumApp } from "@/config/spectrum-functions";

export async function PUT(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await req.json();
    const validation = validateRequest(updateSpectrumAppSchema, body);
    if (!validation.success) return validation.response;

    const result = await updateSpectrumApp(validation.data);
    return NextResponse.json(result);
  } catch (err: any) {
    const msg = err?.response?.data?.errors?.[0]?.message || err?.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
