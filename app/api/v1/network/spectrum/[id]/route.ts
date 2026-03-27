// GET /api/v1/network/spectrum/[id] — get a single spectrum app
// PATCH /api/v1/network/spectrum/[id] — update spectrum app (partial update)
// DELETE /api/v1/network/spectrum/[id] — delete spectrum app
import { withV1Auth, v1Ok, v1Error, v1ValidationError } from "@/lib/api/v1-middleware";
import { updateSpectrumAppSchema } from "@/lib/validation/spectrum";
import { SpectrumService } from "@/lib/services/spectrum-service";

type RouteContext = { params: Promise<{ [key: string]: string | string[] }> };

function getDnsOriginalName(dns: unknown): string | null {
  if (!dns || typeof dns !== "object") return null;
  const value = (dns as { original_name?: unknown }).original_name;
  return typeof value === "string" ? value : null;
}

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
    const result = await SpectrumService.getApp({
      appId: id!,
      userId: auth.userId,
    });

    return v1Ok({
      data: {
        id: result.local.spectrum_id || id,
        dns_name: getDnsOriginalName(result.local.dns),
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
    if (error.code === "FORBIDDEN") {
      return v1Error("FORBIDDEN", 403, "Access denied");
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

    let parsedBody: unknown;
    try {
      parsedBody = await req.json();
    } catch {
      return v1ValidationError(
        [{ path: "body", message: "Invalid JSON in request body" }],
        "Invalid request body"
      );
    }
    const body = parsedBody && typeof parsedBody === "object" ? parsedBody : {};

    try {
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

      const result = await SpectrumService.updateApp({
        appId: id!,
        userId: auth.userId,
        payload: validation.data,
      });

      return v1Ok({
        data: {
          id: result.app?.spectrum_id || id,
          dns_name: getDnsOriginalName(result.app?.dns),
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
      const error = err as Error & { code?: string };
      if (error.code === "NOT_FOUND") {
        return v1Error("NOT_FOUND", 404, "Spectrum app not found");
      }
      if (error.code === "FORBIDDEN") {
        return v1Error("FORBIDDEN", 403, "Access denied");
      }
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
  async (req, auth, context) => {
    const { error, id } = await getValidatedAppId(context);
    if (error) return error;

    try {
      await SpectrumService.deleteApp({
        appId: id!,
        userId: auth.userId,
        audit_context: {
          ip_address: req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown",
          user_agent: req.headers.get("user-agent") || "unknown",
          request_id: crypto.randomUUID(),
          user_email: auth.kind === 'session' ? auth.email : undefined,
          user_role: "user",
        },
      });

      return v1Ok({
        data: {
          id,
          message: "Spectrum app deleted successfully",
        },
      });
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      if (error.code === "NOT_FOUND") {
        return v1Error("NOT_FOUND", 404, "Spectrum app not found");
      }
      if (error.code === "FORBIDDEN") {
        return v1Error("FORBIDDEN", 403, "Access denied");
      }
      console.error("[DELETE /api/v1/network/spectrum/[id]]", error);
      return v1Error(
        "INTERNAL_ERROR",
        500,
        error.message || "Failed to delete spectrum app"
      );
    }
  }
);
