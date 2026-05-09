import { withV1Auth, v1Ok, v1ValidationError } from "@/lib/api/v1-middleware";
import { resolveAuthEmail } from "@/lib/api-auth";
import { getDomainService } from "@/lib/domain-service";
import {
  AddDomainRequestSchema,
  DomainListQuerySchema,
} from "@/lib/domain-service/contracts/schemas";
import { toV1DomainErrorResponse } from "@/lib/domain-service/http/error-mapper";
import { createDomainActor, resolveIdempotencyKey } from "@/lib/domain-service/http/request-context";
import { serializeDomain, serializeDomainWithRouting } from "@/lib/domain-service/http/serializers";

export const GET = withV1Auth("domains:list", async (req, auth) => {
  try {
    const url = new URL(req.url);
    const rawAppId = url.searchParams.get("app_id");
    const query = {
      ...(rawAppId !== null ? { app_id: rawAppId } : {}),
    };

    const validation = DomainListQuerySchema.safeParse(query);
    if (!validation.success) {
      const errors = validation.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return v1ValidationError(errors, "Invalid query parameters");
    }

    const service = getDomainService();
    const actor = createDomainActor({
      req,
      userId: auth.userId,
      userEmail: await resolveAuthEmail(auth),
    });
    const domains = await service.listDomains({
      actor,
      appId: validation.data.app_id,
    });

    return v1Ok({
      data: domains.map(serializeDomainWithRouting),
      meta: { total: domains.length },
    });
  } catch (error) {
    return toV1DomainErrorResponse(error);
  }
});

export const POST = withV1Auth("domains:add", async (req, auth) => {
  try {
    const parsedBody = await req.json();
    const validation = AddDomainRequestSchema.safeParse(parsedBody);
    if (!validation.success) {
      const errors = validation.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return v1ValidationError(errors);
    }

    const service = getDomainService();
    const idempotencyKey = resolveIdempotencyKey(req);
    const actor = createDomainActor({
      req,
      userId: auth.userId,
      userEmail: await resolveAuthEmail(auth),
    });

    const result = await service.addDomain({
      actor,
      appId: validation.data.app_id,
      domain: validation.data.domain,
      idempotencyKey,
    });

    return v1Ok({
      data: {
        domain: serializeDomain(result.domain),
        verification_required: result.verification_required,
        managed_zone_detected: result.managed_zone_detected,
        ownership_source: result.ownership_source,
        verification_instructions: result.verification_instructions,
      },
    }, 201);
  } catch (error) {
    return toV1DomainErrorResponse(error);
  }
});
