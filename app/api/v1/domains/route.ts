import { withV1Auth, v1Ok, v1ValidationError } from "@/lib/api/v1-middleware";
import { getDomainService } from "@/lib/domain-service";
import {
  AddDomainRequestSchema,
  DomainListQuerySchema,
} from "@/lib/domain-service/contracts/schemas";
import { toV1DomainErrorResponse } from "@/lib/domain-service/http/error-mapper";
import { createDomainActor, resolveIdempotencyKey } from "@/lib/domain-service/http/request-context";

export const GET = withV1Auth("domains:list", async (req, auth) => {
  try {
    const url = new URL(req.url);
    const query = {
      app_id: url.searchParams.get("app_id"),
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
      userEmail: auth.kind === "session" ? auth.email : undefined,
    });
    const domains = await service.listDomains({
      actor,
      appId: validation.data.app_id,
    });

    return v1Ok({
      data: domains,
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
      userEmail: auth.kind === "session" ? auth.email : undefined,
    });

    const result = await service.addDomain({
      actor,
      appId: validation.data.app_id,
      domain: validation.data.domain,
      idempotencyKey,
    });

    return v1Ok({ data: result }, 201);
  } catch (error) {
    return toV1DomainErrorResponse(error);
  }
});
