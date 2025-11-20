import { NextRequest, NextResponse } from "next/server";
import { validateRequest } from "@/lib/middleware/validate-request";
import { deletePlatformAppSchema } from "@/lib/validation/platform-apps";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { DeploymentService } from "@/lib/services";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-delete",
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

    const body = await req.json();
    const validation = validateRequest(deletePlatformAppSchema, body);
    if (!validation.success) return validation.response;

    // Delete using deployment service
    try {
      await DeploymentService.delete(validation.data.app_id, auth.user!.id);
      return NextResponse.json({ message: "App deleted successfully" });
    } catch (error: any) {
      const statusCode = error.message === "App not found" ? 404 :
                        error.message === "Unauthorized" ? 403 : 400;
      return NextResponse.json({ error: error.message }, { status: statusCode });
    }
  } catch (err: any) {
    const msg = err?.message || "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
