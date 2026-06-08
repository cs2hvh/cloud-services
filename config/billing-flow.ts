import { Billing } from "@/lib/supabase/queries/billing";
import { serviceLabel } from "@/lib/billing/service-label";

export interface PostProvisionBillingArgs {
  userId: string;
  initialCost: number;
  hourlyRate: number;
  serviceId: string;
  serviceType: "database" | "kubernetes" | "objectspace" | "spectrum" | "platform_apps" | "gpu_pod" | "inference_vector" | "compute" | "custom_image";
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

// closeActive: fetches the active row, computes the prorated charge, deletes
// the row, and returns the charge amount. The row is always removed — callers
// are deleting the resource, so the meter must not outlive it.
// Deduction is best-effort: insufficient credits on deletion is logged, not thrown.
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
  const finalCharge = await closeActive();

  if (finalCharge > 0) {
    try {
      const newBalance = await Billing.deduct(userId, finalCharge);
      Billing.save_transaction({
        userId, amount: finalCharge, status: "completed", type: "usage",
        balanceAfter: newBalance, serviceId, serviceType,
        description: `Final prorated ${serviceLabel(serviceType)} charge`,
      }).catch((e) => console.warn("[closeActiveBilling] save_transaction failed:", e instanceof Error ? e.message : e));
    } catch (e) {
      console.warn("[closeActiveBilling] final charge failed:", e instanceof Error ? e.message : e);
    }
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
