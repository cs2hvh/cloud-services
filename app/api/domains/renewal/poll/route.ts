import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logError } from "@/lib/api/error-sanitizer";
import { getDomainRenewalService } from "@/lib/domain-service/renewal";

/**
 * POST /api/domains/renewal/poll
 *
 * Renewal billing cron — runs daily.
 * Finds completed domain purchases expiring within the next 30 days
 * where the user's credit balance has not yet been charged for renewal,
 * deducts the renewal price from their balance, and records the transaction.
 *
 * Name.com handles the actual domain renewal from the platform account.
 * This endpoint purely handles the user-facing credit deduction.
 *
 * Protected by CRON_SECRET. Called by the cron worker.
 */
export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Cron secret not configured" },
      { status: 500 }
    );
  }

  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token || !safeCompare(token, cronSecret)) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Invalid or missing authorization" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const limit = typeof body.limit === "number" ? Math.min(body.limit, 50) : 20;
    // Charge users whose domain expires within this window (default: 30 days)
    const daysAhead = typeof body.days_ahead === "number" ? Math.min(body.days_ahead, 90) : 30;

    const supabase = await createServiceClient();
    const now = new Date().toISOString();
    const chargeWindow = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString();

    // Find completed purchases:
    // - expires_at is set and within the charge window
    // - renewal_charged is false (not yet billed for next year)
    // - renewal_price is set (we know what to charge)
    //
    // Note: Use ->> (text extraction) instead of -> (JSONB) for boolean comparisons
    // because PostgREST string comparison with "false" is unambiguous across all
    // versions. metadata->>'renewal_charged' = 'false' matches JSON boolean false.
    const { data: rows, error: queryError } = await supabase
      .from("domain_purchase_requests")
      .select("id, user_id, domain, renewal_price, currency, metadata")
      .eq("status", "completed")
      .not("metadata->expires_at", "is", null)
      .not("metadata->renewal_price", "is", null)
      .filter("metadata->>renewal_charged", "eq", "false")
      .filter("metadata->>expires_at", "gt", now)
      .filter("metadata->>expires_at", "lte", chargeWindow)
      .order("metadata->>expires_at", { ascending: true })
      .limit(limit);

    if (queryError) {
      logError("domains/renewal/poll - query", queryError);
      return NextResponse.json(
        { error: "INTERNAL_ERROR", message: "Failed to query expiring domains" },
        { status: 500 }
      );
    }

    const pending = rows ?? [];
    let processed = 0;
    let failed = 0;
    let skipped = 0;
    const failures: { domain: string; error: string }[] = [];

    const renewalService = getDomainRenewalService();

    for (const row of pending) {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;

      // If the user explicitly turned off auto-renew, Name.com will NOT renew
      // the domain. Charging the user's credit would take money for nothing.
      // autorenew_enabled defaults to true (undefined = not set = enabled).
      if (meta.autorenew_enabled === false) {
        skipped++;
        console.log(`[DomainRenewal] Skipping ${row.domain} — auto-renew disabled by user`);
        continue;
      }

      const renewalPrice =
        typeof meta.renewal_price === "number"
          ? meta.renewal_price
          : typeof row.renewal_price === "number"
            ? row.renewal_price
            : null;
      const expiresAt = typeof meta.expires_at === "string" ? meta.expires_at : null;

      if (!renewalPrice || renewalPrice <= 0) {
        skipped++;
        continue;
      }

      // Optimistic lock: set renewal_charged: true BEFORE billing so that if
      // the post-charge metadata update fails (network blip, DB timeout, etc.)
      // the next cron run does NOT double-bill the user.
      // Also filter on autorenew_enabled != false to guard against a user disabling
      // auto-renew between our initial query and this lock acquisition — spreading
      // the stale `meta` would otherwise silently overwrite their preference.
      const { data: lockRow, error: lockError } = await supabase
        .from("domain_purchase_requests")
        .update({
          metadata: { ...meta, renewal_charged: true },
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .filter("metadata->>renewal_charged", "eq", "false")
        .filter("metadata->>autorenew_enabled", "neq", "false")
        .select("id")
        .maybeSingle();

      if (lockError) {
        failed++;
        failures.push({ domain: row.domain, error: "Failed to acquire renewal lock: " + lockError.message });
        console.error("[DomainRenewal] Could not lock record before charging:", { domain: row.domain, error: lockError.message });
        continue;
      }

      if (!lockRow) {
        skipped++;
        continue;
      }

      try {
        // Service: billing + audit + notification
        const { nextExpiresAt } = await renewalService.chargeAndNotify({
          purchaseRequestId: row.id,
          userId: row.user_id,
          domain: row.domain,
          amount: renewalPrice,
          currency: row.currency ?? "USD",
          expiresAt,
        });

        // Cron: advance expiry + reset lock so next cycle picks this up again
        await supabase
          .from("domain_purchase_requests")
          .update({
            metadata: {
              ...meta,
              renewal_charged: false,
              last_renewal_charged_at: new Date().toISOString(),
              expires_at: nextExpiresAt ?? expiresAt,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        processed++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        failed++;
        failures.push({ domain: row.domain, error: message });
        console.error("[DomainRenewal] Failed to charge renewal:", { domain: row.domain, userId: row.user_id, amount: renewalPrice, error: message });

        // Billing failed — restore renewal_charged: false so the next cron can retry
        await supabase
          .from("domain_purchase_requests")
          .update({ metadata: { ...meta, renewal_charged: false }, updated_at: new Date().toISOString() })
          .eq("id", row.id)
          .then(() => undefined, (restoreErr: unknown) => {
            console.error("[DomainRenewal] CRITICAL: failed to restore renewal_charged after billing failure — domain locked until manual fix:", {
              domain: row.domain, id: row.id,
              restoreError: restoreErr instanceof Error ? restoreErr.message : String(restoreErr),
            });
          });
      }
    }

    return NextResponse.json({
      data: { processed, failed, skipped, total: pending.length },
      message: `Renewal billing: ${processed} charged, ${failed} failed, ${skipped} skipped out of ${pending.length} due`,
      ...(failures.length ? { failures } : {}),
    });
  } catch (error: unknown) {
    logError("domains/renewal/poll", error);
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "Renewal poll failed" },
      { status: 500 }
    );
  }
}

function safeCompare(a: string, b: string): boolean {
  try {
    const hashA = createHash("sha256").update(a).digest();
    const hashB = createHash("sha256").update(b).digest();
    return timingSafeEqual(hashA, hashB);
  } catch {
    return false;
  }
}
