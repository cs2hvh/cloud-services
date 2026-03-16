import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getDomainMarketplaceService } from "@/lib/domain-service/marketplace";
import { mapDomainErrorToHttp, toDomainServiceError } from "@/lib/domain-service/core/errors";

export async function GET(
  _req: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:domain-market:purchase-requests:get",
      limit: 80,
      windowMs: 60_000,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "TOO_MANY_REQUESTS",
          message: `Retry after ${rl.retryAfterSec}s`,
        },
        { status: 429 }
      );
    }

    const { requestId } = await context.params;
    if (!requestId) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "requestId is required",
        },
        { status: 400 }
      );
    }

    const service = getDomainMarketplaceService();
    const request = await service.getPurchaseRequest({
      actor: { userId: auth.user!.id },
      requestId,
    });

    return NextResponse.json({ data: request });
  } catch (error: unknown) {
    const mapped = mapDomainErrorToHttp(toDomainServiceError(error));
    return NextResponse.json(
      {
        error: mapped.code,
        message: mapped.message,
        details: mapped.details,
      },
      { status: mapped.status }
    );
  }
}
