// GET /api/v1/network/spectrum — list all spectrum apps owned by the authenticated user
// POST /api/v1/network/spectrum — create a new spectrum app
import { withV1Auth, v1Ok, v1Error, v1ValidationError } from "@/lib/api/v1-middleware";
import { createSpectrumAppSchema } from "@/lib/validation/spectrum";
import { listSpectrumApps, createSpectrumApp } from "@/config/spectrum-functions";
import { ensureBalance } from "@/config/billing-flow";
import { getRatesForSpectrum } from "@/config/pricing";

export const GET = withV1Auth("spectrum:list", async (_req, auth) => {
  try {
    const result = await listSpectrumApps(auth.userId);

    return v1Ok({
      data: result.local.map((app) => {
        const dns = app.dns as any;
        return {
          id: app.spectrum_id,
          dns_name: dns?.original_name || null,
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
        total: result.local.length,
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[GET /api/v1/network/spectrum]", error);
    return v1Error("INTERNAL_ERROR", 500, "Failed to fetch spectrum apps");
  }
});

export const POST = withV1Auth("spectrum:create", async (req, auth) => {
  try {
    const body = await req.json();

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

    // Check billing
    const { initialCost } = await getRatesForSpectrum();
    const balCheck = await ensureBalance(auth.userId, initialCost);

    if (!balCheck.ok) {
      return v1Error(
        "INSUFFICIENT_CREDITS",
        402,
        "Insufficient credits",
        {
          balance: balCheck.balance,
          required: initialCost,
        }
      );
    }

    // Create app
    const result = await createSpectrumApp(validation.data, "user");

    return v1Ok(
      {
        data: {
          id: result.app.spectrum_id,
          dns_name: result.app.dns?.original_name || null,
          protocol: result.app.protocol,
          origin_direct: result.app.origin_direct,
          tls: result.app.tls,
          ip_firewall: result.app.ip_firewall,
          traffic_type: result.app.traffic_type,
          proxy_protocol: result.app.proxy_protocol,
          status: result.app.status,
          created_at: result.app.created_at,
        },
      },
      201
    );
  } catch (err: unknown) {
    const error = err as Error;
    console.error("[POST /api/v1/network/spectrum]", error);
    return v1Error("INTERNAL_ERROR", 500, error.message || "Failed to create spectrum app");
  }
});
