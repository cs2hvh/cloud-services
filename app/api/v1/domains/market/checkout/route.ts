import { withV1Auth, v1Error, v1Ok } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import { getDomainMarketplaceService } from "@/lib/domain-service/marketplace";
import { DomainMarketplacePurchaseRequestSchema } from "@/lib/domain-service/contracts/schemas";
import { toV1DomainErrorResponse } from "@/lib/domain-service/http/error-mapper";
import { createDomainActor, resolveIdempotencyKey } from "@/lib/domain-service/http/request-context";

export const POST = withV1Auth("domains:market:checkout", async (req, auth) => {
  try {
    const parsedBody = await req.json().catch(() => null);
    if (!parsedBody || typeof parsedBody !== "object") {
      return v1Error("VALIDATION_ERROR", 400, "Invalid request body");
    }

    const validation = DomainMarketplacePurchaseRequestSchema.safeParse(parsedBody);
    if (!validation.success) {
      return v1TransformValidationError(validation.error);
    }

    const service = getDomainMarketplaceService();
    const request = await service.createPurchaseRequest({
      actor: createDomainActor({
        req,
        userId: auth.userId,
        userEmail: auth.kind === "session" ? auth.email : undefined,
      }),
      appId: validation.data.app_id,
      domain: validation.data.domain,
      idempotencyKey: resolveIdempotencyKey(req, validation.data.idempotency_key),
      metadata: {
        source: "api-v1-checkout",
      },
    });

    return v1Ok({ data: request }, 201);
  } catch (error) {
    return toV1DomainErrorResponse(error);
  }
});
