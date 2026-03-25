import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getDomainService } from "@/lib/domain-service";
import { toDomainServiceError } from "@/lib/domain-service/core/errors";
import { createDomainActor } from "@/lib/domain-service/http/request-context";
import { toDashboardDomainErrorResponse } from "@/lib/domain-service/http/dashboard-error-mapper";

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
      prefix: "rl:check-ssl",
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
      return NextResponse.json(
        { error: "Invalid route parameters", details: params.error.flatten() },
        { status: 400 }
      );
    }

    const service = getDomainService();
    const result = await service.checkSslStatus({
      actor: createDomainActor({
        req,
        userId: auth.user.id,
        userEmail: auth.user.email || undefined,
      }),
      domainId: params.data.id,
    });

    return NextResponse.json({
      success: true,
      ssl_status: result.ssl_status,
      ...(result.dns_ready !== undefined && { dns_ready: result.dns_ready }),
      ...(result.dns_message && { dns_message: result.dns_message }),
    });
  } catch (error) {
    const serviceError = toDomainServiceError(error);
    return toDashboardDomainErrorResponse(serviceError);
  }
}
