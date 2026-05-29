import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { Platform_Apps } from "@/lib/supabase/queries";
import { Billing } from "@/lib/supabase/queries/billing";
import {
  addPurchasedBytes,
  removeBandwidthRestriction,
} from "@/lib/services/platform-app-bandwidth";
import { BANDWIDTH_PACKS, type BandwidthPackId } from "@/lib/services/platform-app-bandwidth/packs";
import { resolveQuota } from "@/lib/services/platform-app-bandwidth/quota";
import { toUsageSummary, monthBounds, dateOnly } from "@/lib/services/platform-app-bandwidth/utils";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/services/platform-apps/bandwidth/purchase
 *
 * Purchase a bandwidth pack for the current billing period.
 * Deducts from the user's credit balance, increments purchased_bytes,
 * and automatically lifts any active K8s Ingress restriction if the
 * new effective quota brings the app back within limits.
 *
 * Body: { app_id: string; pack: "100gb" | "500gb" | "1tb" }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:platform-app-bandwidth-purchase",
      limit: 10,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { app_id, pack: packId } = body as { app_id?: string; pack?: string };

    if (!app_id || !packId) {
      return NextResponse.json({ error: "Missing required fields: app_id, pack" }, { status: 400 });
    }

    const pack = BANDWIDTH_PACKS[packId as BandwidthPackId];
    if (!pack) {
      return NextResponse.json(
        { error: `Unknown pack '${packId}'. Valid options: ${Object.keys(BANDWIDTH_PACKS).join(", ")}` },
        { status: 400 }
      );
    }

    // Verify ownership
    const appResult = await Platform_Apps.get(app_id);
    if (!appResult.success || !appResult.data) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }
    const app = appResult.data;
    if (app.user_id !== auth.user!.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Check balance before deducting
    const hasBalance = await Billing.has_balance(auth.user!.id, pack.price);
    if (!hasBalance) {
      return NextResponse.json(
        { error: "Insufficient balance", message: `This pack costs $${pack.price.toFixed(2)}. Please top up your account.` },
        { status: 402 }
      );
    }

    // Deduct — throws if balance dropped between check and deduct (race safety)
    const balanceAfter = await Billing.deduct(auth.user!.id, pack.price);

    // Increment purchased_bytes for this billing period.
    // If the upsert fails after the deduct, refund immediately so the user is
    // not charged without receiving the bytes — consistent with postProvisionBilling.
    let updatedRow;
    try {
      updatedRow = await addPurchasedBytes(app_id, auth.user!.id, pack.bytes);
    } catch (applyErr) {
      Billing.topup(auth.user!.id, pack.price)
        .then((refundResult) =>
          Billing.save_transaction({
            userId: auth.user!.id,
            amount: pack.price,
            status: "completed",
            type: "refund",
            balanceAfter: refundResult.credit_balance,
            serviceId: app_id,
            serviceType: "platform_apps",
            description: `Bandwidth pack ${pack.label} refunded after apply failure`,
          })
        )
        .catch((refundErr) => logError("services/platform-apps/bandwidth/purchase:refund", refundErr));
      throw applyErr;
    }

    const { start, end } = monthBounds();
    Billing.save_transaction({
      userId: auth.user!.id,
      amount: pack.price,
      status: "completed",
      type: "purchase",
      balanceAfter,
      description: `${pack.label} platform app bandwidth pack for ${app.name}`,
      serviceId: app_id,
      serviceType: "platform_apps",
      periodStart: dateOnly(start),
      periodEnd: dateOnly(end),
      metadata: {
        app_id,
        app_name: app.name,
        pack_id: pack.id,
        pack_label: pack.label,
        bandwidth_bytes: pack.bytes,
      },
    }).catch((error) => {
      console.warn("[platform-app-bandwidth] Failed to record pack purchase transaction:", error);
    });

    // Resolve quota and build the updated summary so the caller can update the UI
    const quota = await resolveQuota(app.size);
    const summary = toUsageSummary(updatedRow, quota);

    // If the app was restricted and is now within limits, lift the K8s block immediately.
    let restrictionLifted = false;
    if (summary.lifecycleStatus !== "restricted" && updatedRow.restricted_at) {
      const liftResult = await removeBandwidthRestriction(app.name).catch(() => ({ removed: false }));
      restrictionLifted = liftResult.removed;

      // Update the DB row to clear restricted state
      if (restrictionLifted) {
        const supabase = await createServiceClient();
        await (supabase as any)
          .from("platform_app_bandwidth_usage_monthly")
          .update({ lifecycle_status: "ok", restored_at: new Date().toISOString(), restricted_at: null })
          .eq("app_id", app_id)
          .eq("period_start", dateOnly(start));
      }
    }

    return NextResponse.json({
      ok: true,
      pack: { id: pack.id, label: pack.label, bytes: pack.bytes, price: pack.price },
      restriction_lifted: restrictionLifted,
      usage: summary,
    });
  } catch (err: unknown) {
    logError("services/platform-apps/bandwidth/purchase", err);
    return NextResponse.json({ error: sanitizeError(err) }, { status: 500 });
  }
}
