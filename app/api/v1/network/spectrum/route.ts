// GET /api/v1/network/spectrum — list all spectrum apps owned by the authenticated user
// POST /api/v1/network/spectrum — create a new spectrum app
import { withV1Auth, v1Ok, v1Error, v1ValidationError } from "@/lib/api/v1-middleware";
import { createSpectrumAppSchema } from "@/lib/validation/spectrum";
import { SpectrumService } from "@/lib/services/spectrum-service";

function getDnsOriginalName(dns: unknown): string | null {
  if (!dns || typeof dns !== "object") return null;
  const value = (dns as { original_name?: unknown }).original_name;
  return typeof value === "string" ? value : null;
}

export const GET = withV1Auth("spectrum:list", async (_req, auth) => {
  try {
    const apps = await SpectrumService.listApps(auth.userId);

    return v1Ok({
      data: apps.map((app) => {
        return {
          id: app.spectrum_id,
          dns_name: getDnsOriginalName(app.dns),
          protocol: app.protocol,
        origin_direct: app.origin_direct,
        tls: app.tls,
        ip_firewall: app.ip_firewall,
        traffic_type: app.traffic_type,
        proxy_protocol: app.proxy_protocol,
        status: app.status,
        created_at: app.created_at,
        updated_at: app.updated_at,
        };
      }),
      meta: {
        total: apps.length,
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[GET /api/v1/network/spectrum]", error);
    return v1Error("INTERNAL_ERROR", 500, "Failed to fetch spectrum apps");
  }
});

export const POST = withV1Auth("spectrum:create", async (req, auth) => {
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
    const validation = createSpectrumAppSchema.safeParse({
      ...body,
      owner_id: auth.userId,
    });

    if (!validation.success) {
      const errors = validation.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return v1ValidationError(errors);
    }

    const app = await SpectrumService.createApp({
      userId: auth.userId,
      payload: validation.data,
    });

    return v1Ok(
      {
        data: {
          id: app.spectrum_id,
          dns_name: app.dns?.original_name || null,
          protocol: app.protocol,
          origin_direct: app.origin_direct,
          tls: app.tls,
          ip_firewall: app.ip_firewall,
          traffic_type: app.traffic_type,
          proxy_protocol: app.proxy_protocol,
          status: app.status,
          created_at: app.created_at,
        },
      },
      201
    );
  } catch (err: unknown) {
    const error = err as Error & { code?: string; details?: Record<string, unknown> };
    if (error.code === "INSUFFICIENT_CREDITS") {
      return v1Error("INSUFFICIENT_CREDITS", 402, "Insufficient credits", error.details);
    }
    console.error("[POST /api/v1/network/spectrum]", error);
    return v1Error("INTERNAL_ERROR", 500, error.message || "Failed to create spectrum app");
  }
});
