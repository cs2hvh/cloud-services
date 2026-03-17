import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getDomainService } from "@/lib/domain-service";
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
      prefix: "rl:activate-domain",
      limit: 5,
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

    const service = getDomainService();
    const operation = await service.activateDomain({
      actor: createDomainActor({
        req,
        userId: auth.user.id,
        userEmail: auth.user.email || undefined,
      }),
      domainId: params.data.id,
      idempotencyKey: resolveIdempotencyKey(req),
    });

    return NextResponse.json(
      {
        success: true,
        operation_id: operation.id,
        status: operation.status,
        message: "Domain activation started. Poll operation status for completion.",
      },
      { status: 202 }
    );
  } catch (error: unknown) {
    return toDashboardDomainErrorResponse(error);
  }
}
