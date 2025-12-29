import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { Platform_App_Deployments, Platform_Apps } from "@/lib/supabase/queries";

export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-list",
      limit: 10,
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

    const apps = await Platform_Apps.list_by_owner(auth.user!.id);

    const appsWithRollback = await Promise.all(
      (apps || []).map(async (app: any) => {
        const prev = await Platform_App_Deployments.get_previous_successful(
          app.id,
          app.active_deployment_id ?? null
        );
        const canRollback = !!(prev.success && prev.data);
        return { ...app, can_rollback: canRollback };
      })
    );

    return NextResponse.json({ apps: appsWithRollback });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
