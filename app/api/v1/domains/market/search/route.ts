import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import { getDomainMarketplaceService } from "@/lib/domain-service/marketplace";
import { DomainMarketplaceSearchRequestSchema } from "@/lib/domain-service/contracts/schemas";
import { toV1DomainErrorResponse } from "@/lib/domain-service/http/error-mapper";

export const POST = withV1Auth("domains:market:search", async (req) => {
  try {
    const parsedBody = await req.json().catch(() => null);
    if (!parsedBody || typeof parsedBody !== "object") {
      return v1Error("VALIDATION_ERROR", 400, "Invalid request body");
    }

    const validation = DomainMarketplaceSearchRequestSchema.safeParse(parsedBody);
    if (!validation.success) {
      return v1TransformValidationError(validation.error);
    }

    const service = getDomainMarketplaceService();
    const result = await service.search({
      query: validation.data.query,
      tlds: validation.data.tlds,
    });

    return v1Ok({ data: result });
  } catch (error) {
    return toV1DomainErrorResponse(error);
  }
});
