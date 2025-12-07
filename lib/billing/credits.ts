import { createServiceClient } from "@/lib/supabase/server";

export const BillingCredits = {
  getBalance: async (userId: string): Promise<number> => {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .schema("billing")
      .from("user_credits")
      .select("credit_balance")
      .eq("user_id", userId)
      .single();
    if (error) return 0;
    return (data?.credit_balance as number) ?? 0;
  },

  hasSufficientBalance: async (userId: string, requiredAmount: number): Promise<boolean> => {
    const balance = await BillingCredits.getBalance(userId);
    return balance >= requiredAmount;
  },

  deduct: async (userId: string, amount: number): Promise<number> => {
    const supabase = await createServiceClient();
    const current = await BillingCredits.getBalance(userId);
    if (current < amount) throw new Error("Insufficient balance");
    const { data, error } = await supabase
      .schema("billing")
      .from("user_credits")
      .update({ credit_balance: current - amount })
      .eq("user_id", userId)
      .select("credit_balance")
      .single();
    if (error) throw new Error(`Credit deduction failed: ${error.message}`);
    return (data?.credit_balance as number) ?? current - amount;
  },

  addActiveKubernetes: async (params: {
    userId: string;
    serviceId: string;
    hourlyRate: number;
  }) => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("active_kubernetes")
      .insert({
        user_id: params.userId,
        service_id: params.serviceId,
        hourly_rate: params.hourlyRate,
        status: "active",
        last_billed_at: new Date().toISOString(),
      });
    if (error) throw new Error(`Failed to insert active_kubernetes: ${error.message}`);
  },
};
