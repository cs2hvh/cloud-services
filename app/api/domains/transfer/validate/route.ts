import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getDomainTransferService } from "@/lib/domain-service/transfer";
import { DomainTransferCheckEligibilitySchema } from "@/lib/domain-service/contracts/schemas";
import { createDomainActor } from "@/lib/domain-service/http/request-context";
import { toDashboardDomainErrorResponse } from "@/lib/domain-service/http/dashboard-error-mapper";
import { validateRequest } from "@/lib/middleware/validate-request";

/**
 * POST /api/domains/transfer/validate
 * Check if a domain is eligible for transfer.
 */
export async function POST(req: Request) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user.id, {
      prefix: "rl:domain-transfer:validate",
      limit: 30,
      windowMs: 60_000,
    });

    if (!rl.allowed) {
      return NextResponse.json(
        { error: "TOO_MANY_REQUESTS", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = validateRequest(DomainTransferCheckEligibilitySchema, body);
    if (!parsed.success) return parsed.response;

    const service = getDomainTransferService();
    const result = await service.checkEligibility({
      actor: createDomainActor({
        req,
        userId: auth.user.id,
        userEmail: auth.user.email || undefined,
      }),
      domain: parsed.data.domain,
    });

    return NextResponse.json({ data: result });
  } catch (error: unknown) {
    return toDashboardDomainErrorResponse(error);
  }
}
