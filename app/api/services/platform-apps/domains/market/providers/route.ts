import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getDomainMarketplaceService } from "@/lib/domain-service/marketplace";
import { mapDomainErrorToHttp, toDomainServiceError } from "@/lib/domain-service/core/errors";

export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:domain-market:providers",
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

    const service = getDomainMarketplaceService();
    const summary = service.getSummary();

    return NextResponse.json({
      data: summary,
      deprecated: true,
      message: "Use /api/services/platform-apps/domains/market/summary for reseller metadata.",
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
