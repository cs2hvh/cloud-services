import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getDomainTransferService } from "@/lib/domain-service/transfer";
import { createDomainActor } from "@/lib/domain-service/http/request-context";
import { toDashboardDomainErrorResponse } from "@/lib/domain-service/http/dashboard-error-mapper";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * GET /api/domains/transfer/[requestId]
 * Get details for a single transfer request.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const { requestId } = await params;
    if (!isValidUUID(requestId)) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid transfer request ID" },
        { status: 400 }
      );
    }

    const rl = await limitByUser(auth.user.id, {
      prefix: "rl:domain-transfer:get",
      limit: 60,
      windowMs: 60_000,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        { error: "TOO_MANY_REQUESTS", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const service = getDomainTransferService();
    const request = await service.getTransferRequest({
      actor: createDomainActor({
        req,
        userId: auth.user.id,
        userEmail: auth.user.email || undefined,
      }),
      requestId,
    });

    return NextResponse.json({ data: request });
  } catch (error: unknown) {
    return toDashboardDomainErrorResponse(error);
  }
}

/**
 * DELETE /api/domains/transfer/[requestId]
 * User-facing delete: hides a terminal transfer from the default activity list
 * while preserving billing, provider, and audit history.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const { requestId } = await params;
    if (!isValidUUID(requestId)) {
      return NextResponse.json(
        { error: "VALIDATION_ERROR", message: "Invalid transfer request ID" },
        { status: 400 }
      );
    }

    const rl = await limitByUser(auth.user.id, {
      prefix: "rl:domain-transfer:delete",
      limit: 20,
      windowMs: 60_000,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        { error: "TOO_MANY_REQUESTS", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const service = getDomainTransferService();
    const request = await service.archiveTransferRequest({
      actor: createDomainActor({
        req,
        userId: auth.user.id,
        userEmail: auth.user.email || undefined,
      }),
      requestId,
    });

    return NextResponse.json({ data: request });
  } catch (error: unknown) {
    return toDashboardDomainErrorResponse(error);
  }
}
