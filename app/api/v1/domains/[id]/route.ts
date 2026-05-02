import { withV1Auth, v1Ok } from "@/lib/api/v1-middleware";
import { resolveAuthEmail } from "@/lib/api-auth";
import { v1ExtractId } from "@/lib/api/v1-helpers";
import { getDomainService } from "@/lib/domain-service";
import { toV1DomainErrorResponse } from "@/lib/domain-service/http/error-mapper";
import { createDomainActor, resolveIdempotencyKey } from "@/lib/domain-service/http/request-context";

export const DELETE = withV1Auth("domains:remove", async (req, auth, context) => {
  const idResult = await v1ExtractId(context);
  if (idResult.error) return idResult.error;

  try {
    const service = getDomainService();
    const idempotencyKey = resolveIdempotencyKey(req);
    const actor = createDomainActor({
      req,
      userId: auth.userId,
      userEmail: await resolveAuthEmail(auth),
    });

    const result = await service.removeDomain({
      actor,
      domainId: idResult.id,
      idempotencyKey,
    });

    return v1Ok({ data: result });
  } catch (error) {
    return toV1DomainErrorResponse(error);
  }
});
