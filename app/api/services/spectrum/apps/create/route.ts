import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { createSpectrumAppSchema } from "@/lib/validation/spectrum";
import { createSpectrumApp } from "@/config/spectrum-functions";
import { authenticateUser } from "@/lib/auth/server-auth";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const body = await req.json();
    const validation = validateRequest(createSpectrumAppSchema, body);
    if (!validation.success) return validation.response;

    const result = await createSpectrumApp(validation.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    const msg = err?.response?.data?.errors?.[0]?.message || err?.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
