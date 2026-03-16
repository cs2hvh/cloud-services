import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getDomainMarketplaceService } from "@/lib/domain-service/marketplace";
import { mapDomainErrorToHttp, toDomainServiceError } from "@/lib/domain-service/core/errors";

const createSchema = z.object({
  app_id: z.string().uuid(),
  domain: z.string().min(3).max(253),
  idempotency_key: z.string().min(8).max(128).optional(),
});

const listQuerySchema = z.object({
  app_id: z.string().uuid().optional(),
  limit: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const n = Number.parseInt(value, 10);
      return Number.isNaN(n) ? undefined : n;
    })
    .refine((n) => n === undefined || (n >= 1 && n <= 100), {
      message: "limit must be between 1 and 100",
    }),
});

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
    const parsed = listQuerySchema.safeParse({
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
      actor: { userId: auth.user!.id },
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
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "Invalid purchase request payload",
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
