import { withV1Auth, v1Ok } from "@/lib/api/v1-middleware";
import { getDomainMarketplaceService } from "@/lib/domain-service/marketplace";
import { toV1DomainErrorResponse } from "@/lib/domain-service/http/error-mapper";

export const GET = withV1Auth("domains:market:summary", async () => {
  try {
    const service = getDomainMarketplaceService();
    return v1Ok({ data: service.getSummary() });
  } catch (error) {
    return toV1DomainErrorResponse(error);
  }
});
