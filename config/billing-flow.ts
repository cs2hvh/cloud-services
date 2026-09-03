import { Billing } from "@/lib/supabase/queries/billing";
import { serviceLabel } from "@/lib/billing/service-label";
import { openMeter, closeMeter, type MeteredService } from "@/lib/billing/meters";

export interface PostProvisionBillingArgs {
  userId: string;
  initialCost: number;
  hourlyRate: number;
  serviceId: string;
  serviceType: "database" | "kubernetes" | "objectspace" | "spectrum" | "platform_apps" | "gpu_pod" | "inference_vector" | "compute" | "custom_image";
  /**
   * Selects the v2 price row — an instance_plans slug, a platform-app size.
   * Omit where the service has a single flat price. A caller that knows its
   * plan MUST pass it, or the v2 sweep resolves no price and bills nothing.
   */
  planKey?: string;
  /** Node count / GPU count — a multiplier on the rate, not storage GB. */
  units?: number;
  addActive: (args: { userId: string; serviceId: string; hourlyRate: number }) => Promise<void>;
}


// Check balance before provisioning
export async function ensureBalance(userId: string, required: number): Promise<{ ok: boolean; balance?: number }>
{
  const hasBalance = await Billing.has_balance(userId, required);
  if (!hasBalance) {
    const bal = await Billing.get_balance(userId);
    return { ok: false, balance: bal };
  }
  return { ok: true };
}

// After successful provisioning: deduct upfront, then register active service.
// If the active-row insert fails, refund the deducted amount so credits are not lost.
export async function postProvisionBilling({
  userId,
  initialCost,
  hourlyRate,
  serviceId,
  serviceType,
  planKey,
  units,
  addActive,
}: PostProvisionBillingArgs)
{
  const newBalance = initialCost > 0 ? await Billing.deduct(userId, initialCost) : null;
  if (initialCost > 0) {
    try {
      await Billing.save_transaction({
        userId,
        amount: initialCost,
        status: "completed",
        type: "setup",
        balanceAfter: newBalance,
        serviceId,
        serviceType,
        description: `Initial ${serviceLabel(serviceType)} setup charge`,
      });
    } catch (error) {
      console.warn(
        "[postProvisionBilling] Failed to record setup transaction:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  try {
    await addActive({ userId, serviceId, hourlyRate });
    // Billing v2 shadow meter. This is the SECOND provisioning entry point —
    // spectrum, kubernetes and the Proxmox compute path come through here
    // rather than settleProvision, so wiring only that one would have left
    // four services silently unmetered under v2.
    try {
      await openMeter({
        serviceType: serviceType as MeteredService,
        serviceId,
        userId,
        planKey,
        units,
      });
    } catch (meterErr) {
      console.error("[postProvisionBilling] v2 meter open failed:", meterErr);
    }
  } catch (insertError) {
    try {
      if (initialCost > 0) {
        const refundResult = await Billing.topup(userId, initialCost);
        try {
          await Billing.save_transaction({
            userId,
            amount: initialCost,
            status: "completed",
            type: "refund",
            balanceAfter: refundResult.credit_balance,
            serviceId,
            serviceType,
            description: `Refund for ${serviceLabel(serviceType)} setup charge after billing registration failed`,
          });
        } catch (error) {
          console.warn(
            "[postProvisionBilling] Failed to record refund transaction:",
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    } catch (refundError) {
      throw new Error(
        `Failed to register active service billing and refund also failed: ${
          refundError instanceof Error ? refundError.message : String(refundError)
        }. Original insert error: ${
          insertError instanceof Error ? insertError.message : String(insertError)
        }`
      );
    }
    throw insertError;
  }
}

// closeActive: deletes the v1 billing.active_* row and returns what the v1
// model computed as the "final prorated charge". That number is LOGGED and
// NOT DEDUCTED. Read the next paragraph before putting the deduction back.
//
// THE V1 FINAL CHARGE WAS A DOUBLE CHARGE OF THE WHOLE LIFETIME. v1 computed
// hourly_rate × (now − last_billed_at), and last_billed_at was advanced only by
// the old cron worker, which has been gone since 2026-08-24. So at teardown it
// resolved to hourly_rate × (now − provision time): every hour the v2 sweep
// had already billed, billed again in one lump. A 30-day pod would have paid
// for 720 hours twice. Found 2026-09-03 by reading the two paths side by side;
// no teardown had happened since the 2026-08-31 relaunch, so no customer was
// hit — the next one would have been.
//
// The v1 row is still deleted, because a few provisioning paths read its
// presence as "already billed" and would re-charge setup on every status poll
// if it were left behind. The v2 meter is closed here too, so the sweep stops
// at the hour that just completed. The partial final hour is deliberately not
// billed: under-charging by up to an hour is the safe error while the sweep
// bills only whole completed hours.
export async function closeActiveBilling({
  userId,
  serviceId,
  serviceType,
  closeActive,
}: {
  userId: string;
  serviceId: string;
  serviceType: "database" | "kubernetes" | "objectspace" | "spectrum" | "platform_apps" | "gpu_pod" | "inference_vector" | "compute" | "custom_image";
  closeActive: () => Promise<number>;
}): Promise<void> {
  let v1Estimate = 0;
  try {
    v1Estimate = await closeActive();
  } catch (e) {
    // A failed v1 close must not stop the v2 meter from closing below; a meter
    // that outlives its resource is what charged one customer $4,629.91 for a
    // deleted bucket.
    console.error("[closeActiveBilling] v1 active row close failed:", e instanceof Error ? e.message : e);
  }

  try {
    await closeMeter(serviceType as MeteredService, serviceId);
  } catch (meterErr) {
    console.error("[closeActiveBilling] v2 meter close failed:", meterErr);
  }

  if (v1Estimate > 0) {
    console.log(
      `[closeActiveBilling] v1 would have charged $${v1Estimate.toFixed(6)} for ${serviceLabel(serviceType)} ` +
      `${serviceId} (user ${userId}) at teardown — not deducted; the hourly sweep already billed those hours`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// C2/C3 — atomic provisioning reservation (free-fleet protection)
//
// The old flow was: ensureBalance() [a non-locking READ] → provision → deduct.
// Concurrent creates all passed the same read and provisioned real resources
// before any deduction (a low balance could spawn an unbounded fleet), and a
// post-provision billing failure left a live, un-metered resource.
//
// New flow: reserveProvision() atomically debits (setup + 1h) via the proven CAS
// (billing_deduct's `WHERE credit_balance >= amount`) BEFORE provisioning, so the
// concurrency gate IS the deduction. The "+1h" is a transient hold recorded as NO
// ledger row; on success settleProvision() refunds the hour (keeping only the real
// setup charge) and registers the meter. Any non-settle exit refunds the FULL
// reservation via releaseProvision() — callers wrap provisioning in try/finally
// with a `settled` flag so every early-return failure path refunds exactly once.
// The hourly billing model is otherwise unchanged.

const RESERVE_HOURS = 1;
const roundCurrency = (n: number): number => Math.round(n * 1e6) / 1e6;

export type ServiceType = PostProvisionBillingArgs["serviceType"];

export interface ProvisionReservation {
  userId: string;
  reserved: number;
}

// Atomic concurrency gate: silently hold (setup + 1h) before provisioning.
// Returns ok=false (with the current balance) if the user cannot cover it.
export async function reserveProvision(params: {
  userId: string;
  initialCost: number;
  hourlyRate: number;
}): Promise<{ ok: boolean; balance?: number; reservation: ProvisionReservation }> {
  const reserved = roundCurrency(
    Math.max(params.initialCost, 0) + Math.max(params.hourlyRate, 0) * RESERVE_HOURS
  );
  if (reserved <= 0) {
    return { ok: true, reservation: { userId: params.userId, reserved: 0 } };
  }
  try {
    const balance = await Billing.deduct(params.userId, reserved);
    return { ok: true, balance, reservation: { userId: params.userId, reserved } };
  } catch {
    const balance = await Billing.get_balance(params.userId).catch(() => undefined);
    return { ok: false, balance, reservation: { userId: params.userId, reserved: 0 } };
  }
}

// Refund a reservation that was never settled (provisioning failed/aborted).
// Safe to call on the zero reservation (no-op). Must never throw.
export async function releaseProvision(
  reservation: ProvisionReservation | undefined
): Promise<void> {
  if (!reservation || reservation.reserved <= 0) return;
  try {
    await Billing.topup(reservation.userId, reservation.reserved);
  } catch (error) {
    console.error(
      "[releaseProvision] CRITICAL: failed to refund unsettled reservation",
      { userId: reservation.userId, reserved: reservation.reserved },
      error instanceof Error ? error.message : String(error)
    );
  }
}

// Settle a successful provision. The reservation already debited (setup + 1h).
// Registers the meter; if that throws, NOTHING has been refunded yet, so the
// caller's finally → releaseProvision refunds the full reservation exactly once.
// After the meter is live this NEVER throws (a throw would double-refund), so the
// transient 1h hold release and the setup-transaction record are best-effort.
export async function settleProvision(params: {
  reservation: ProvisionReservation;
  initialCost: number;
  hourlyRate: number;
  serviceId: string;
  serviceType: ServiceType;
  /**
   * Selects the v2 price row — an instance_plans slug, a platform-app size.
   * Omit where the service has a single price. Callers that know their plan
   * MUST pass it, or the v2 sweep resolves no price and silently bills nothing.
   */
  planKey?: string;
  /** Node count, GPU count. A multiplier on the hourly rate, not storage GB. */
  units?: number;
  addActive: (args: { userId: string; serviceId: string; hourlyRate: number }) => Promise<void>;
}): Promise<void> {
  const { reservation } = params;

  // Register the meter. A throw here leaves the reservation untouched so the
  // caller's finally refunds it once (and the caller should tear down the
  // provisioned resource — it is live but unmetered).
  await params.addActive({
    userId: reservation.userId,
    serviceId: params.serviceId,
    hourlyRate: params.hourlyRate,
  });

  // Billing v2 shadow meter, opened HERE rather than at each of the twelve
  // call sites that provision something. Wiring this per-service was the first
  // attempt and it covered two of ten — every service already funnels through
  // this function, so doing it once is both complete and impossible to forget
  // when the eleventh service is added.
  //
  // v2 charges nothing until scripts/billing/sweep.ts is run with --apply, so
  // running both meters in parallel cannot double-bill. That overlap is the
  // point: it is what makes the pre-cutover comparison possible.
  try {
    await openMeter({
      serviceType: params.serviceType as MeteredService,
      serviceId: params.serviceId,
      userId: reservation.userId,
      planKey: params.planKey,
      units: params.units,
    });
  } catch (meterErr) {
    // Never fail a provision for the shadow meter. v1 is still the system of
    // record until cutover; the v2 sweep reports anything that went missing.
    console.error("[settleProvision] v2 meter open failed:", meterErr);
  }

  // Meter is live — from here we must NOT throw. Release the transient hour-hold.
  const hourHold = roundCurrency(Math.max(params.hourlyRate, 0) * RESERVE_HOURS);
  if (hourHold > 0) {
    try {
      await Billing.topup(reservation.userId, hourHold);
    } catch (error) {
      console.error(
        "[settleProvision] failed to release transient hour-hold (customer over-held ~1h):",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  // Record the real setup charge on the customer ledger (best-effort, as before).
  if (params.initialCost > 0) {
    try {
      const balanceAfter = await Billing.get_balance(reservation.userId).catch(() => null);
      await Billing.save_transaction({
        userId: reservation.userId,
        amount: params.initialCost,
        status: "completed",
        type: "setup",
        balanceAfter,
        serviceId: params.serviceId,
        serviceType: params.serviceType,
        description: `Initial ${serviceLabel(params.serviceType)} setup charge`,
      });
    } catch (error) {
      console.warn(
        "[settleProvision] failed to record setup transaction:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
