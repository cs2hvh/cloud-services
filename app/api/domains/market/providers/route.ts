import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getDomainMarketplaceService } from "@/lib/domain-service/marketplace";
import { toDashboardDomainErrorResponse } from "@/lib/domain-service/http/dashboard-error-mapper";

export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user.id, {
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
    });
  } catch (error: unknown) {
    return toDashboardDomainErrorResponse(error);
  }
}
