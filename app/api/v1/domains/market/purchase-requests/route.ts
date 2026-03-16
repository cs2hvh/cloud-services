import { withV1Auth, v1Error, v1Ok, v1ValidationError } from "@/lib/api/v1-middleware";
import { v1TransformValidationError } from "@/lib/api/v1-helpers";
import { getDomainMarketplaceService } from "@/lib/domain-service/marketplace";
import {
  DomainMarketplacePurchaseRequestListQuerySchema,
  DomainMarketplacePurchaseRequestSchema,
} from "@/lib/domain-service/contracts/schemas";
import { toV1DomainErrorResponse } from "@/lib/domain-service/http/error-mapper";
import { createDomainActor, resolveIdempotencyKey } from "@/lib/domain-service/http/request-context";

export const GET = withV1Auth("domains:market:purchase-requests:list", async (req, auth) => {
  try {
    const url = new URL(req.url);
    const query = {
      app_id: url.searchParams.get("app_id") || undefined,
      limit: url.searchParams.get("limit") || undefined,
    };

    const validation = DomainMarketplacePurchaseRequestListQuerySchema.safeParse(query);
    if (!validation.success) {
      const errors = validation.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return v1ValidationError(errors, "Invalid query parameters");
    }

    const service = getDomainMarketplaceService();
    const requests = await service.listPurchaseRequests({
      actor: createDomainActor({
        req,
        userId: auth.userId,
        userEmail: auth.kind === "session" ? auth.email : undefined,
      }),
      appId: validation.data.app_id,
      limit: validation.data.limit,
    });

    return v1Ok({
      data: requests,
      meta: { total: requests.length },
    });
  } catch (error) {
    return toV1DomainErrorResponse(error);
  }
});

export const POST = withV1Auth("domains:market:purchase-requests:create", async (req, auth) => {
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
        source: "api-v1-marketplace",
      },
    });

    return v1Ok({ data: request }, 201);
  } catch (error) {
    return toV1DomainErrorResponse(error);
  }
});
