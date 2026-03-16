import { withV1Auth, v1Ok } from "@/lib/api/v1-middleware";
import { v1ExtractId } from "@/lib/api/v1-helpers";
import { getDomainService } from "@/lib/domain-service";
import { toV1DomainErrorResponse } from "@/lib/domain-service/http/error-mapper";

export const GET = withV1Auth("domains:operation:get", async (_req, auth, context) => {
  const idResult = await v1ExtractId(context, "operationId");
  if (idResult.error) return idResult.error;

  try {
    const service = getDomainService();
    const operation = await service.getOperation({
      actor: { userId: auth.userId },
      operationId: idResult.id,
    });

    return v1Ok({ data: operation });
  } catch (error) {
    return toV1DomainErrorResponse(error);
  }
});
