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
  domainId: string;
}) {
  const run = async () => {
    if (typeof params.service.runActivationOperation !== "function") return;
    try {
      console.log("[domains.activate] Background activation starting", {
        operationId: params.operationId,
        domainId: params.domainId,
        userId: params.actor.userId,
      });
      await params.service.runActivationOperation(params.operationId, params.actor);
      console.log("[domains.activate] Background activation finished", {
        operationId: params.operationId,
        domainId: params.domainId,
        userId: params.actor.userId,
      });
    } catch (error) {
      console.error("[domains.activate] Background activation failed", {
        operationId: params.operationId,
        domainId: params.domainId,
        userId: params.actor.userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
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
  let domainIdForLog: string | null = null;

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
    domainIdForLog = rawParams?.id ?? null;
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
    console.log("[domains.activate] Activation accepted", {
      operationId: operation.id,
      domainId: params.data.id,
      userId: auth.user.id,
      status: operation.status,
    });

    scheduleActivationRun({
      operationId: operation.id,
      actor,
      service,
      domainId: params.data.id,
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
    console.error("[domains.activate] Activation request failed", {
      domainId: domainIdForLog,
      userId: auth.user.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return toDashboardDomainErrorResponse(error);
  }
}
