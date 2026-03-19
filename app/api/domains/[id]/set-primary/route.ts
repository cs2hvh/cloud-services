import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getDomainService } from "@/lib/domain-service";
import { SetPrimaryDomainRequestSchema } from "@/lib/domain-service/contracts/schemas";
import {
  createDomainActor,
  resolveIdempotencyKey,
} from "@/lib/domain-service/http/request-context";
import {
  dashboardValidationError,
  toDashboardDomainErrorResponse,
} from "@/lib/domain-service/http/dashboard-error-mapper";

const ParamsSchema = z.object({
  id: z.string().uuid("Invalid domain id"),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user.id, {
      prefix: "rl:set-primary-domain",
      limit: 10,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const rawParams = await context.params;
    const params = ParamsSchema.safeParse(rawParams);
    if (!params.success) {
      return dashboardValidationError("Invalid route parameters", params.error.flatten());
    }

    const body = await req.json().catch(() => ({}));
    const parsed = SetPrimaryDomainRequestSchema.safeParse(body || {});
    if (!parsed.success) {
      return dashboardValidationError("Invalid request body", parsed.error.flatten());
    }

    const service = getDomainService();
    const domain = await service.setPrimaryDomain({
      actor: createDomainActor({
        req,
        userId: auth.user.id,
        userEmail: auth.user.email || undefined,
      }),
      domainId: params.data.id,
      redirectToPrimary: parsed.data.redirect_to_primary,
      idempotencyKey: resolveIdempotencyKey(req),
    });

    return NextResponse.json({
      success: true,
      domain,
      message: "Primary domain set successfully.",
    });
  } catch (error: unknown) {
    return toDashboardDomainErrorResponse(error);
  }
}
