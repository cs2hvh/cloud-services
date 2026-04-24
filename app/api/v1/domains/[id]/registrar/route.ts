import { withV1Auth, v1Ok, v1Error, v1ValidationError } from "@/lib/api/v1-middleware";
import { resolveAuthEmail } from "@/lib/api-auth";
import { v1ExtractId } from "@/lib/api/v1-helpers";
import { createDomainActor } from "@/lib/domain-service/http/request-context";
import { getDomainService } from "@/lib/domain-service";
import { DomainServiceError } from "@/lib/domain-service/core/errors";
import { toV1DomainErrorResponse } from "@/lib/domain-service/http/error-mapper";
import { z } from "zod";

const PatchRegistrarSchema = z.object({
  autorenew_enabled: z.boolean().optional(),
  locked: z.boolean().optional(),
  privacy_enabled: z.boolean().optional(),
});

/**
 * GET /api/v1/domains/{id}/registrar
 * Returns live registrar settings for a domain owned by the authenticated user.
 * Only applies to platform-managed domains (purchased via Name.com).
 * Returns managed: false for externally connected domains.
 */
export const GET = withV1Auth("domains:registrar:read", async (req, auth, context) => {
  const idResult = await v1ExtractId(context);
  if (idResult.error) return idResult.error;

  try {
    const actor = createDomainActor({ req, userId: auth.userId, userEmail: await resolveAuthEmail(auth) });
    const result = await getDomainService().getRegistrarSettings({ actor, domainId: idResult.id });

    if (!result.managed) {
      return v1Ok({ data: { domain: result.domain, managed: false, autorenew_enabled: null, locked: null, privacy_enabled: null, expires_at: null } });
    }

    return v1Ok({ data: { domain: result.domain, managed: true, zone: result.zone, autorenew_enabled: result.autorenew_enabled, locked: result.locked, privacy_enabled: result.privacy_enabled, expires_at: result.expires_at } });
  } catch (err) {
    if (err instanceof DomainServiceError) return toV1DomainErrorResponse(err);
    return v1Error("INTERNAL_ERROR", 500, "Failed to load registrar settings");
  }
});

/**
 * PATCH /api/v1/domains/{id}/registrar
 * Update registrar settings for a platform-managed domain.
 * Supports: autorenew_enabled, locked, privacy_enabled.
 * At least one field is required.
 */
export const PATCH = withV1Auth("domains:registrar:update", async (req, auth, context) => {
  const idResult = await v1ExtractId(context);
  if (idResult.error) return idResult.error;

  try {
    const parsedBody = await req.json().catch(() => ({}));
    const validation = PatchRegistrarSchema.safeParse(parsedBody ?? {});
    if (!validation.success) {
      return v1ValidationError(validation.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })));
    }

    const { autorenew_enabled, locked, privacy_enabled } = validation.data;
    if (autorenew_enabled === undefined && locked === undefined && privacy_enabled === undefined) {
      return v1ValidationError([{ path: "", message: "At least one of autorenew_enabled, locked, or privacy_enabled is required" }]);
    }

    const actor = createDomainActor({ req, userId: auth.userId, userEmail: await resolveAuthEmail(auth) });
    const result = await getDomainService().updateRegistrarSettings({ actor, domainId: idResult.id, updates: { autorenew_enabled, locked, privacy_enabled } });

    if (!result.managed) {
      return v1Error("DOMAIN_NOT_MANAGED", 400, "This domain is not managed by the platform registrar. Auto-renew must be configured at your registrar.");
    }

    return v1Ok({ data: { domain: result.domain, managed: true, zone: result.zone, autorenew_enabled: result.autorenew_enabled, locked: result.locked, privacy_enabled: result.privacy_enabled, expires_at: result.expires_at } });
  } catch (err) {
    if (err instanceof DomainServiceError) return toV1DomainErrorResponse(err);
    return v1Error("INTERNAL_ERROR", 500, "Failed to update registrar settings");
  }
});

