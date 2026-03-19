import { NextResponse } from "next/server";
import { withV1Auth } from "@/lib/api/v1-middleware";
import { getDomainMarketplaceService } from "@/lib/domain-service/marketplace";
import { toV1DomainErrorResponse } from "@/lib/domain-service/http/error-mapper";

export const GET = withV1Auth("domains:market:providers", async () => {
  try {
    const service = getDomainMarketplaceService();
    const summary = service.getSummary();

    return NextResponse.json({
      data: summary,
      deprecated: true,
      message: "Use /api/v1/domains/market/summary for reseller metadata.",
    });
  } catch (error) {
    return toV1DomainErrorResponse(error);
  }
});
