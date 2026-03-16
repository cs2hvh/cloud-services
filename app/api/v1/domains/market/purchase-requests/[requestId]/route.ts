import { v1ExtractId } from "@/lib/api/v1-helpers";
import { withV1Auth, v1Ok } from "@/lib/api/v1-middleware";
import { getDomainMarketplaceService } from "@/lib/domain-service/marketplace";
import { toV1DomainErrorResponse } from "@/lib/domain-service/http/error-mapper";
import { createDomainActor } from "@/lib/domain-service/http/request-context";

export const GET = withV1Auth(
  "domains:market:purchase-requests:get",
  async (req, auth, context) => {
    const idResult = await v1ExtractId(context, "requestId");
    if (idResult.error) return idResult.error;

    try {
      const service = getDomainMarketplaceService();
      const request = await service.getPurchaseRequest({
        actor: createDomainActor({
          req,
          userId: auth.userId,
          userEmail: auth.kind === "session" ? auth.email : undefined,
        }),
        requestId: idResult.id,
      });

      return v1Ok({ data: request });
    } catch (error) {
      return toV1DomainErrorResponse(error);
    }
  }
);
