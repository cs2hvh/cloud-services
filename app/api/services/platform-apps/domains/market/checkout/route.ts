import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getDomainMarketplaceService } from "@/lib/domain-service/marketplace";
import { mapDomainErrorToHttp, toDomainServiceError } from "@/lib/domain-service/core/errors";

const checkoutSchema = z.object({
  app_id: z.string().uuid(),
  domain: z.string().min(3).max(253),
  idempotency_key: z.string().min(8).max(128).optional(),
});

export async function POST(req: Request) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:domain-market:checkout",
      limit: 60,
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

    const body = await req.json();
    const parsed = checkoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Invalid checkout request",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const service = getDomainMarketplaceService();
    const request = await service.createPurchaseRequest({
      actor: { userId: auth.user!.id },
      appId: parsed.data.app_id,
      domain: parsed.data.domain,
      idempotencyKey: parsed.data.idempotency_key,
      metadata: {
        source: "legacy-checkout-route",
      },
    });

    return NextResponse.json(
      {
        data: request,
      },
      { status: 201 }
    );
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
