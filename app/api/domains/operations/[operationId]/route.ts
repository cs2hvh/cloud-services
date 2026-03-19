import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { getDomainService } from "@/lib/domain-service";
import { createDomainActor } from "@/lib/domain-service/http/request-context";
import {
  dashboardValidationError,
  toDashboardDomainErrorResponse,
} from "@/lib/domain-service/http/dashboard-error-mapper";

const ParamsSchema = z.object({
  operationId: z.string().uuid("Invalid operation id"),
});

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ operationId: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rawParams = await context.params;
    const params = ParamsSchema.safeParse(rawParams);
    if (!params.success) {
      return dashboardValidationError("Invalid route parameters", params.error.flatten());
    }

    const service = getDomainService();
    const operation = await service.getOperation({
      actor: createDomainActor({
        req,
        userId: auth.user.id,
        userEmail: auth.user.email || undefined,
      }),
      operationId: params.data.operationId,
    });

    return NextResponse.json({
      success: true,
      operation,
    });
  } catch (error: unknown) {
    return toDashboardDomainErrorResponse(error);
  }
}
