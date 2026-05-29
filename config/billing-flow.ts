import { Billing } from "@/lib/supabase/queries/billing";

export interface PostProvisionBillingArgs {
  userId: string;
  initialCost: number;
  hourlyRate: number;
  serviceId: string;
  serviceType: "database" | "kubernetes" | "objectspace" | "spectrum" | "platform_apps" | "gpu_pod" | "inference_vector";
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
        description: `Initial ${serviceType.replace("_", " ")} setup charge`,
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
            description: `Refund for ${serviceType.replace("_", " ")} setup charge after billing registration failed`,
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

/**
 * Close an active service billing row — deducts the final prorated charge
 * and removes the active row. If the delete fails after deduction, refunds.
 */
export async function closeActiveBilling({
  userId,
  serviceId,
  serviceType,
  closeActive,
}: {
  userId: string;
  serviceId: string;
  serviceType: "database" | "kubernetes" | "objectspace" | "spectrum" | "platform_apps" | "gpu_pod" | "inference_vector";
  closeActive: () => Promise<{ finalCharge: number }>;
}): Promise<void> {
  const { finalCharge } = await closeActive();

  if (finalCharge > 0) {
    const newBalance = await Billing.deduct(userId, finalCharge);
    try {
      await Billing.save_transaction({
        userId,
        amount: finalCharge,
        status: "completed",
        type: "usage",
        balanceAfter: newBalance,
        serviceId,
        serviceType,
        description: `Final prorated ${serviceType.replace("_", " ")} charge`,
      });
    } catch (error) {
      console.warn(
        "[closeActiveBilling] Failed to record final charge transaction:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }
}
