import { after } from "next/server";
import { withV1Auth, v1Ok } from "@/lib/api/v1-middleware";
import { resolveAuthEmail } from "@/lib/api-auth";
import { v1ExtractId } from "@/lib/api/v1-helpers";
import { getDomainService } from "@/lib/domain-service";
import { toV1DomainErrorResponse } from "@/lib/domain-service/http/error-mapper";
import { createDomainActor, resolveIdempotencyKey } from "@/lib/domain-service/http/request-context";

function scheduleActivationRun(params: {
  operationId: string;
  actor: ReturnType<typeof createDomainActor>;
  service: ReturnType<typeof getDomainService>;
}) {
  const run = async () => {
    if (typeof params.service.runActivationOperation !== "function") return;
    try {
      await params.service.runActivationOperation(params.operationId, params.actor);
    } catch (error) {
      console.error("[v1.domains.activate] Background activation failed", error);
    }
  };

  try {
    after(() => {
      void run();
    });
  } catch {
    void run();
  }
}

export const POST = withV1Auth("domains:activate", async (req, auth, context) => {
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

    const operation = await service.activateDomain({
      actor,
      domainId: idResult.id,
      idempotencyKey,
    });

    scheduleActivationRun({
      operationId: operation.id,
      actor,
      service,
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
