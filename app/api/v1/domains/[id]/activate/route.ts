import { withV1Auth, v1Ok } from "@/lib/api/v1-middleware";
import { v1ExtractId } from "@/lib/api/v1-helpers";
import { getDomainService } from "@/lib/domain-service";
import { toV1DomainErrorResponse } from "@/lib/domain-service/http/error-mapper";
import { createDomainActor, resolveIdempotencyKey } from "@/lib/domain-service/http/request-context";

export const POST = withV1Auth("domains:activate", async (req, auth, context) => {
  const idResult = await v1ExtractId(context);
  if (idResult.error) return idResult.error;

  try {
    const service = getDomainService();
    const idempotencyKey = resolveIdempotencyKey(req);
    const actor = createDomainActor({
      req,
      userId: auth.userId,
      userEmail: auth.kind === "session" ? auth.email : undefined,
    });

    const operation = await service.activateDomain({
      actor,
      domainId: idResult.id,
      idempotencyKey,
    });

    return v1Ok(
      {
        data: {
          operation_id: operation.id,
          status: "pending",
        },
      },
      202
    );
  } catch (error) {
    return toV1DomainErrorResponse(error);
  }
});
