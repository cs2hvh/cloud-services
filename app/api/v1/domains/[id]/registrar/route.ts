import { withV1Auth, v1Ok, v1Error, v1ValidationError } from "@/lib/api/v1-middleware";
import { resolveAuthEmail } from "@/lib/api-auth";
import { v1ExtractId } from "@/lib/api/v1-helpers";
import { createDomainActor } from "@/lib/domain-service/http/request-context";
import { NameComRegistrarAdapter } from "@/lib/domain-service/integrations/namecom-registrar.adapter";
import { resolveManagedZone } from "@/lib/domain-service/http/domain-access";
import { createServiceClient } from "@/lib/supabase/server";
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
    const supabase = await createServiceClient();

    // Verify domain ownership by user_id + id
    const { data: domainRow, error: dbError } = await supabase
      .from("platform_app_domains")
      .select("id, domain, status")
      .eq("id", idResult.id)
      .eq("user_id", auth.userId)
      .neq("status", "removed")
      .maybeSingle();

    if (dbError) {
      return v1Error("INTERNAL_ERROR", 500, "Failed to load domain");
    }
    if (!domainRow) {
      return v1Error("NOT_FOUND", 404, "Domain not found");
    }

    const adapter = new NameComRegistrarAdapter();
    const managed = await resolveManagedZone(adapter, domainRow.domain);

    if (!managed) {
      return v1Ok({
        data: {
          domain: domainRow.domain,
          managed: false,
          autorenew_enabled: null,
          locked: null,
          privacy_enabled: null,
          expires_at: null,
        },
      });
    }

    const domainInfo = await adapter.getDomain(managed.zone);

    return v1Ok({
      data: {
        domain: domainRow.domain,
        managed: true,
        zone: managed.zone,
        autorenew_enabled:
          typeof domainInfo.autorenewEnabled === "boolean" ? domainInfo.autorenewEnabled : null,
        locked: typeof domainInfo.locked === "boolean" ? domainInfo.locked : null,
        privacy_enabled:
          typeof domainInfo.privacyEnabled === "boolean" ? domainInfo.privacyEnabled : null,
        expires_at: domainInfo.expireDate ?? null,
      },
    });
  } catch {
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
      const errors = validation.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return v1ValidationError(errors);
    }

    const { autorenew_enabled, locked, privacy_enabled } = validation.data;
    if (
      autorenew_enabled === undefined &&
      locked === undefined &&
      privacy_enabled === undefined
    ) {
      return v1ValidationError([
        { path: "", message: "At least one of autorenew_enabled, locked, or privacy_enabled is required" },
      ]);
    }

    const supabase = await createServiceClient();

    const { data: domainRow, error: dbError } = await supabase
      .from("platform_app_domains")
      .select("id, domain, status")
      .eq("id", idResult.id)
      .eq("user_id", auth.userId)
      .neq("status", "removed")
      .maybeSingle();

    if (dbError) {
      return v1Error("INTERNAL_ERROR", 500, "Failed to load domain");
    }
    if (!domainRow) {
      return v1Error("NOT_FOUND", 404, "Domain not found");
    }

    const adapter = new NameComRegistrarAdapter();
    const managed = await resolveManagedZone(adapter, domainRow.domain);

    if (!managed) {
      return v1Error(
        "DOMAIN_NOT_MANAGED",
        400,
        "This domain is not managed by the platform registrar. Auto-renew must be configured at your registrar."
      );
    }

    await adapter.updateDomain(managed.zone, {
      ...(autorenew_enabled !== undefined ? { autorenewEnabled: autorenew_enabled } : {}),
      ...(locked !== undefined ? { locked } : {}),
      ...(privacy_enabled !== undefined ? { privacyEnabled: privacy_enabled } : {}),
    });

    const updated = await adapter.getDomain(managed.zone);

    // Persist autorenew preference in domain_purchase_requests.metadata so the
    // renewal billing cron can skip domains where the user opted out.
    // Only persisted when autorenew_enabled is explicitly being changed.
    // Non-blocking — failure doesn't affect the response.
    if (autorenew_enabled !== undefined) {
      ;(async () => {
        try {
          const { data: req } = await supabase
            .from("domain_purchase_requests")
            .select("id, metadata")
            .eq("user_id", auth.userId)
            .eq("domain", domainRow.domain)
            .eq("status", "completed")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (req) {
            await supabase
              .from("domain_purchase_requests")
              .update({
                metadata: { ...(req.metadata as Record<string, unknown> ?? {}), autorenew_enabled },
                updated_at: new Date().toISOString(),
              })
              .eq("id", req.id);
          }
        } catch (err) {
          console.warn("[v1/domains/registrar] Failed to persist autorenew_enabled in metadata:", err);
        }
      })();
    }

    // Emit audit log (non-blocking)
    const actor = createDomainActor({
      req,
      userId: auth.userId,
      userEmail: await resolveAuthEmail(auth),
    });
    void actor; // actor used only for audit context; audit wiring can be added later

    return v1Ok({
      data: {
        domain: domainRow.domain,
        managed: true,
        zone: managed.zone,
        autorenew_enabled:
          typeof updated.autorenewEnabled === "boolean" ? updated.autorenewEnabled : null,
        locked: typeof updated.locked === "boolean" ? updated.locked : null,
        privacy_enabled:
          typeof updated.privacyEnabled === "boolean" ? updated.privacyEnabled : null,
        expires_at: updated.expireDate ?? null,
      },
    });
  } catch {
    return v1Error("INTERNAL_ERROR", 500, "Failed to update registrar settings");
  }
});
