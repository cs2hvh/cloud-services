import { Billing } from "@/lib/supabase/queries/billing";

export interface PostProvisionBillingArgs {
  userId: string;
  initialCost: number;
  hourlyRate: number;
  serviceId: string;
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

// After successful provisioning: deduct upfront, then register active service
export async function postProvisionBilling({ userId, initialCost, hourlyRate, serviceId, addActive }: PostProvisionBillingArgs)
{
  await Billing.deduct(userId, initialCost);
  await addActive({ userId, serviceId, hourlyRate });
}
