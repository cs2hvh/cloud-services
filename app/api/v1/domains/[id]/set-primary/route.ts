import { withV1Auth, v1Ok, v1ValidationError } from "@/lib/api/v1-middleware";
import { v1ExtractId } from "@/lib/api/v1-helpers";
import { getDomainService } from "@/lib/domain-service";
import { SetPrimaryDomainRequestSchema } from "@/lib/domain-service/contracts/schemas";
import { toV1DomainErrorResponse } from "@/lib/domain-service/http/error-mapper";

export const POST = withV1Auth("domains:set-primary", async (req, auth, context) => {
  const idResult = await v1ExtractId(context);
  if (idResult.error) return idResult.error;

  try {
    const parsedBody = await req.json().catch(() => ({}));
    const validation = SetPrimaryDomainRequestSchema.safeParse(parsedBody || {});
    if (!validation.success) {
      const errors = validation.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return v1ValidationError(errors);
    }

    const service = getDomainService();
    const idempotencyKey = req.headers.get("idempotency-key") || undefined;

    const domain = await service.setPrimaryDomain({
      actor: { userId: auth.userId },
      domainId: idResult.id,
      redirectToPrimary: validation.data.redirect_to_primary,
      idempotencyKey,
    });

    return v1Ok({ data: domain });
  } catch (error) {
    return toV1DomainErrorResponse(error);
  }
});
