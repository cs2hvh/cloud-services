import { after, NextRequest, NextResponse } from "next/server";
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

function scheduleActivationRun(params: {
  operationId: string;
  actor: ReturnType<typeof createDomainActor>;
  service: ReturnType<typeof getDomainService>;
}) {
  const run = async () => {
    if (typeof params.service.runActivationOperation !== "function") return;
    try {
      await params.service.runActivationOperation(params.operationId, params.actor);
    } catch (error) {
      console.error("[domains.activate] Background activation failed", error);
    }
  };

  try {
    after(() => {
      void run();
    });
  } catch {
    void run();
  }
}

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

    const actor = createDomainActor({
      req,
      userId: auth.user.id,
      userEmail: auth.user.email || undefined,
    });
    const service = getDomainService();
    const operation = await service.activateDomain({
      actor,
      domainId: params.data.id,
      idempotencyKey: resolveIdempotencyKey(req),
    });

    scheduleActivationRun({
      operationId: operation.id,
      actor,
      service,
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
