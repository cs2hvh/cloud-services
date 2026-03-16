import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getDomainMarketplaceService } from "@/lib/domain-service/marketplace";
import { mapDomainErrorToHttp, toDomainServiceError } from "@/lib/domain-service/core/errors";
import {
  DomainMarketplacePurchaseRequestListQuerySchema,
  DomainMarketplacePurchaseRequestSchema,
} from "@/lib/domain-service/contracts/schemas";
import { createDomainActor, resolveIdempotencyKey } from "@/lib/domain-service/http/request-context";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function GET(req: Request) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:domain-market:purchase-requests:list",
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

    const url = new URL(req.url);
    const parsed = DomainMarketplacePurchaseRequestListQuerySchema.safeParse({
      app_id: url.searchParams.get("app_id") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Invalid query parameters",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const service = getDomainMarketplaceService();
    const requests = await service.listPurchaseRequests({
      actor: createDomainActor({
        req,
        userId: auth.user!.id,
        userEmail: auth.user!.email || undefined,
      }),
      appId: parsed.data.app_id,
      limit: parsed.data.limit,
    });

    return NextResponse.json({
      data: requests,
      meta: { total: requests.length },
    });
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

export async function POST(req: Request) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:domain-market:purchase-requests:create",
      limit: 20,
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
    const parsed = validateRequest(DomainMarketplacePurchaseRequestSchema, body);
    if (!parsed.success) return parsed.response;

    const service = getDomainMarketplaceService();
    const idempotencyKey = resolveIdempotencyKey(req, parsed.data.idempotency_key);
    const request = await service.createPurchaseRequest({
      actor: createDomainActor({
        req,
        userId: auth.user!.id,
        userEmail: auth.user!.email || undefined,
      }),
      appId: parsed.data.app_id,
      domain: parsed.data.domain,
      idempotencyKey,
      metadata: {
        source: "dashboard-marketplace",
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
