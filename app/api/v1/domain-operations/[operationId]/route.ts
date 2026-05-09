import { withV1Auth, v1Ok } from "@/lib/api/v1-middleware";
import { v1ExtractId } from "@/lib/api/v1-helpers";
import { getDomainService } from "@/lib/domain-service";
import { toV1DomainErrorResponse } from "@/lib/domain-service/http/error-mapper";
import { createDomainActor } from "@/lib/domain-service/http/request-context";
import { serializeDomainOperation } from "@/lib/domain-service/http/serializers";

export const GET = withV1Auth("domains:operation:get", async (_req, auth, context) => {
  const idResult = await v1ExtractId(context, "operationId");
  if (idResult.error) return idResult.error;

  try {
    const service = getDomainService();
    const actor = createDomainActor({
      req: _req,
      userId: auth.userId,
      userEmail: auth.kind === "session" ? auth.email : undefined,
    });
    const operation = await service.getOperation({
      actor,
      operationId: idResult.id,
    });

    return v1Ok({ data: serializeDomainOperation(operation) });
  } catch (error) {
    return toV1DomainErrorResponse(error);
  }
});
