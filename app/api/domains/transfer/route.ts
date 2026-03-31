import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getDomainTransferService } from "@/lib/domain-service/transfer";
import {
  DomainTransferCreateSchema,
  DomainTransferListQuerySchema,
} from "@/lib/domain-service/contracts/schemas";
import { createDomainActor, resolveIdempotencyKey } from "@/lib/domain-service/http/request-context";
import { toDashboardDomainErrorResponse } from "@/lib/domain-service/http/dashboard-error-mapper";
import { validateRequest } from "@/lib/middleware/validate-request";

/**
 * GET /api/domains/transfer
 * List all transfer requests for the authenticated user.
 */
export async function GET(req: Request) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user.id, {
      prefix: "rl:domain-transfer:list",
      limit: 60,
      windowMs: 60_000,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        { error: "TOO_MANY_REQUESTS", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const url = new URL(req.url);
    const parsed = DomainTransferListQuerySchema.safeParse({
      limit: url.searchParams.get("limit") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const service = getDomainTransferService();
    const requests = await service.listTransferRequests({
      actor: createDomainActor({
        req,
        userId: auth.user.id,
        userEmail: auth.user.email || undefined,
      }),
      limit: parsed.data.limit,
    });

    return NextResponse.json({
      data: requests,
      meta: { total: requests.length },
    });
  } catch (error: unknown) {
    return toDashboardDomainErrorResponse(error);
  }
}

/**
 * POST /api/domains/transfer
 * Create a new domain transfer request.
 */
export async function POST(req: Request) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user.id, {
      prefix: "rl:domain-transfer:create",
      limit: 10,
      windowMs: 60_000,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        { error: "TOO_MANY_REQUESTS", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = validateRequest(DomainTransferCreateSchema, body);
    if (!parsed.success) return parsed.response;

    const service = getDomainTransferService();
    const idempotencyKey = resolveIdempotencyKey(req, parsed.data.idempotency_key);
    const request = await service.createTransferRequest({
      actor: createDomainActor({
        req,
        userId: auth.user.id,
        userEmail: auth.user.email || undefined,
      }),
      domain: parsed.data.domain,
      authCode: parsed.data.auth_code,
      purchasePrice: parsed.data.purchase_price,
      privacyEnabled: parsed.data.privacy_enabled,
      idempotencyKey,
      metadata: { source: "dashboard" },
    });

    return NextResponse.json({ data: request }, { status: 201 });
  } catch (error: unknown) {
    return toDashboardDomainErrorResponse(error);
  }
}
