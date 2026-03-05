// GET /api/v1/network/spectrum/[id] — get a single spectrum app
// PATCH /api/v1/network/spectrum/[id] — update spectrum app (partial update)
// DELETE /api/v1/network/spectrum/[id] — delete spectrum app
import { withV1Auth, v1Ok, v1Error, v1ValidationError } from "@/lib/api/v1-middleware";
import { updateSpectrumAppSchema } from "@/lib/validation/spectrum";
import { getSpectrumApp, updateSpectrumApp, deleteSpectrumApp } from "@/config/spectrum-functions";
import { Spectrum_Apps } from "@/lib/supabase/queries/spectrum_apps";
import { Billing } from "@/lib/supabase/queries/billing";

type RouteContext = { params: Promise<{ [key: string]: string | string[] }> };

async function getValidatedAppId(context: RouteContext | undefined) {
  if (!context?.params) {
    return {
      error: v1Error("INTERNAL_ERROR", 500, "Missing route context"),
      id: null,
    };
  }

  const rawParams = await context.params;
  const id = Array.isArray(rawParams.id) ? rawParams.id[0] : rawParams.id;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!id || !uuidRegex.test(id)) {
    return {
      error: v1Error("INVALID_ID", 400, "Invalid app ID format", { field: "id" }),
      id: null,
    };
  }

  return { error: null, id };
}

export const GET = withV1Auth("spectrum:get", async (_req, auth, context) => {
  const { error, id } = await getValidatedAppId(context);
  if (error) return error;

  try {
    const result = await getSpectrumApp(id!);

    // Check if app exists
    if (!result.local) {
      return v1Error("NOT_FOUND", 404, "Spectrum app not found");
    }

    // Check ownership
    if (result.local.owner_id !== auth.userId) {
      return v1Error("FORBIDDEN", 403, "Access denied");
    }

    const dns = result.local.dns as any;
    return v1Ok({
      data: {
        id: result.local.spectrum_id || id,
        dns_name: dns?.original_name || null,
        protocol: result.local.protocol,
        origin_direct: result.local.origin_direct,
        tls: result.local.tls,
        ip_firewall: result.local.ip_firewall,
        traffic_type: result.local.traffic_type,
        proxy_protocol: result.local.proxy_protocol,
        status: result.local.status,
        created_at: result.local.created_at,
        updated_at: result.local.updated_at,
        cloudflare_status: result.cloudflare ? "active" : "inactive",
      },
    });
  } catch (err: unknown) {
    const error = err as Error & { code?: string };
    if (error.code === "NOT_FOUND") {
      return v1Error("NOT_FOUND", 404, "Spectrum app not found");
    }
    console.error("[GET /api/v1/network/spectrum/[id]]", error);
    return v1Error("INTERNAL_ERROR", 500, "Failed to fetch spectrum app");
  }
});

export const PATCH = withV1Auth(
  "spectrum:update",
  async (req, auth, context) => {
    const { error, id } = await getValidatedAppId(context);
    if (error) return error;

    try {
      const body = await req.json();

      // Validate request
      const validation = updateSpectrumAppSchema.safeParse({
        app_id: id,
        ...body,
      });

      if (!validation.success) {
        const errors = validation.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        }));
        return v1ValidationError(errors);
      }

      // Check ownership
      const existing = await Spectrum_Apps.get(id!);
      if (!existing.success || !existing.data) {
        return v1Error("NOT_FOUND", 404, "Spectrum app not found");
      }

      if (existing.data.owner_id !== auth.userId) {
        return v1Error("FORBIDDEN", 403, "Access denied");
      }

      // Update app
      const result = await updateSpectrumApp(validation.data);

      const dns = result.app?.dns as any;
      return v1Ok({
        data: {
          id: result.app?.spectrum_id || id,
          dns_name: dns?.original_name || null,
          protocol: result.app?.protocol,
          origin_direct: result.app?.origin_direct,
          tls: result.app?.tls,
          ip_firewall: result.app?.ip_firewall,
          traffic_type: result.app?.traffic_type,
          proxy_protocol: result.app?.proxy_protocol,
          status: result.app?.status,
          created_at: result.app?.created_at,
          updated_at: result.app?.updated_at,
          cloudflare_status: result.cloudflare ? "active" : "inactive",
        },
      });
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[PATCH /api/v1/network/spectrum/[id]]", error);
      return v1Error(
        "INTERNAL_ERROR",
        500,
        error.message || "Failed to update spectrum app"
      );
    }
  }
);

export const DELETE = withV1Auth(
  "spectrum:delete",
  async (_req, auth, context) => {
    const { error, id } = await getValidatedAppId(context);
    if (error) return error;

    try {
      // Check ownership
      const existing = await Spectrum_Apps.get(id!);
      if (!existing.success || !existing.data) {
        return v1Error("NOT_FOUND", 404, "Spectrum app not found");
      }

      if (existing.data.owner_id !== auth.userId) {
        return v1Error("FORBIDDEN", 403, "Access denied");
      }

      // Close billing
      try {
        await Billing.close_active_service("spectrum", {
          userId: auth.userId,
          serviceId: id!,
          failOnInsufficient: false,
        });
      } catch (billErr) {
        console.warn("[DELETE spectrum] Billing close failed:", billErr);
      }

      // Delete app
      await deleteSpectrumApp(id!);

      return v1Ok({
        data: {
          id,
          message: "Spectrum app deleted successfully",
        },
      });
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[DELETE /api/v1/network/spectrum/[id]]", error);
      return v1Error(
        "INTERNAL_ERROR",
        500,
        error.message || "Failed to delete spectrum app"
      );
    }
  }
);
