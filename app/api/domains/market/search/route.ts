import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getDomainMarketplaceService } from "@/lib/domain-service/marketplace";
import { DomainMarketplaceSearchRequestSchema } from "@/lib/domain-service/contracts/schemas";
import { toDashboardDomainErrorResponse } from "@/lib/domain-service/http/dashboard-error-mapper";
import { validateRequest } from "@/lib/middleware/validate-request";

export async function POST(req: Request) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user.id, {
      prefix: "rl:domain-market:search",
      limit: 40,
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
    const parsed = validateRequest(DomainMarketplaceSearchRequestSchema, body);
    if (!parsed.success) return parsed.response;

    const service = getDomainMarketplaceService();
    const result = await service.search({
      query: parsed.data.query,
      tlds: parsed.data.tlds,
    });

    return NextResponse.json({ data: result });
  } catch (error: unknown) {
    return toDashboardDomainErrorResponse(error);
  }
}
