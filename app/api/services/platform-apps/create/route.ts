import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { createPlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_Apps } from "@/lib/supabase/queries";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-create",
      limit: 5,
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

    const body = await req.json();
    const validation = validateRequest(createPlatformAppSchema, body);
    if (!validation.success) return validation.response;

    const { env_vars, ...appData } = validation.data;

    // Generate slug from name
    const slug = `${appData.name}-${Math.random().toString(36).substring(2, 8)}`;

    // Create app record
    const appPayload = {
      ...appData,
      slug,
      user_id: auth.user!.id,
      status: "pending" as const,
    };

    const result = await Platform_Apps.create(appPayload);
    
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Add environment variables if provided
    if (env_vars && env_vars.length > 0) {
      await Platform_Apps.set_env_vars(result.data.id, env_vars);
    }

    return NextResponse.json(result.data, { status: 201 });
  } catch (err: any) {
    const msg = err?.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
