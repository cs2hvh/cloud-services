import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { AuditLogService } from "@/lib/audit/service";

export const dynamic = "force-dynamic";

/**
 * QUOTE-path GPU pricing, written through billing.set_gpu_markup() — the
 * guarded, SECURITY DEFINER path (refuses below-cost, unknown ids, and
 * zero-row filter matches in the DATABASE; never raises). The function does
 * not audit; this route does. Its response carries the drift block (charge
 * markup vs quote markups) so the caller learns immediately whether the two
 * price books still agree.
 *
 * Blanket updates (null filters → every matching row) require an explicit
 * blanket:true flag — an accidental null must not repro a 192-row write.
 */
export async function PUT(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok || !admin.userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized - Admin access required" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const blanket = body.blanket === true;
  const gpuCatalogId = body.gpu_catalog_id ? String(body.gpu_catalog_id) : null;
  const cloudType = body.cloud_type ? String(body.cloud_type) : null;
  const interruptible =
    body.interruptible === undefined || body.interruptible === null
      ? null
      : Boolean(body.interruptible);
  const markup = Number(body.markup_pct);
  const floor = Number(body.floor_per_hour_usd ?? 0);
  const note = body.note ? String(body.note).slice(0, 300) : null;

  if (!blanket && !gpuCatalogId) {
    return NextResponse.json(
      { success: false, error: "gpu_catalog_id required (or pass blanket: true explicitly)" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(markup)) {
    return NextResponse.json(
      { success: false, error: "markup_pct is required" },
      { status: 400 },
    );
  }

  try {
    const supabase = await createServiceClient();
    const baseArgs = {
      p_gpu_catalog_id: gpuCatalogId,
      p_cloud_type: cloudType,
      p_interruptible: interruptible,
      p_markup_pct: markup,
      p_floor_per_hour: floor,
      p_note: note,
      p_actor: admin.userId,
    };

    // Hard dependency on the 8-arg guarded signature (p_blanket lives in the
    // DATABASE since 355a3225) — a regression to the old function should fail
    // loudly here, not degrade quietly.
    const { data: result, error: rpcError } = await supabase
      .schema("billing")
      .rpc("set_gpu_markup", { ...baseArgs, p_blanket: blanket });

    if (rpcError) {
      console.error("[Admin GPU] set_gpu_markup rpc failed:", rpcError.message);
      return NextResponse.json({ success: false, error: "Update failed" }, { status: 500 });
    }
    const outcome = result as {
      success?: boolean;
      error?: string;
      rowsUpdated?: number;
      blanket?: boolean;
      wouldAffect?: number;
      drift?: {
        chargeMarkup: number;
        quoteMarkupMin: number;
        quoteMarkupMax: number;
        agrees: boolean;
        quoteIsUniform: boolean;
      };
    } | null;
    if (!outcome?.success) {
      return NextResponse.json(
        {
          success: false,
          error: outcome?.error ?? "Refused",
          wouldAffect: outcome?.wouldAffect,
        },
        { status: 422 },
      );
    }

    await AuditLogService.create({
      user_id: admin.userId,
      user_role: "admin",
      user_email: admin.email,
      action: "update",
      service_type: "pricing",
      service_id: blanket
        ? `gpu_quote:blanket:${cloudType ?? "*"}:${interruptible ?? "*"}`
        : `gpu_quote:${gpuCatalogId}:${cloudType ?? "*"}:${interruptible ?? "*"}`,
      service_name: blanket ? "GPU quote pricing (blanket)" : `GPU quote pricing ${gpuCatalogId}`,
      after_state: {
        markup_pct: markup,
        floor_per_hour_usd: floor,
        rows_updated: outcome.rowsUpdated,
        // "changed 192" and "changed 192 deliberately" are different facts a
        // year from now — record the function's own confirmation of scope.
        blanket: outcome.blanket,
        drift: outcome.drift,
        note,
      },
      metadata: {
        via: "admin-panel",
        path: "billing.set_gpu_markup",
        note: "QUOTE path — charge path is billing.service_pricing gpu_pod/*",
      },
    });

    return NextResponse.json({ ...outcome, success: true });
  } catch (err) {
    console.error("[Admin GPU] quote pricing unexpected error:", err);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
