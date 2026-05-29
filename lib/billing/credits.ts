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

  addActiveGpuPod: async (params: {
    userId: string;
    serviceId: number;
    hourlyRate: number;
  }) => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("active_gpu_pods")
      .insert({
        user_id: params.userId,
        service_id: params.serviceId,
        hourly_rate: params.hourlyRate,
        status: "active",
        last_billed_at: new Date().toISOString(),
      });
    if (error) throw new Error(`Failed to insert active_gpu_pods: ${error.message}`);
  },

  closeActiveGpuPod: async (params: { serviceId: number }): Promise<{ finalCharge: number }> => {
    const supabase = await createServiceClient();
    const { data: row, error: getErr } = await supabase
      .schema("billing")
      .from("active_gpu_pods")
      .select("hourly_rate, last_billed_at")
      .eq("service_id", params.serviceId)
      .maybeSingle();

    if (getErr) throw new Error(`Failed to fetch active_gpu_pods: ${getErr.message}`);

    let finalCharge = 0;
    if (row) {
      const rate = parseFloat(String(row.hourly_rate));
      if (rate > 0) {
        const lastBilledAt = row.last_billed_at as string | undefined;
        const last = lastBilledAt ? new Date(/[+-]\d{2}:?\d{2}$/.test(lastBilledAt) || lastBilledAt.endsWith("Z") ? lastBilledAt : `${lastBilledAt}Z`) : null;
        const hoursUsed = last ? Math.max(0, (Date.now() - last.getTime()) / 3_600_000) : 1;
        finalCharge = parseFloat((rate * hoursUsed).toFixed(8));
      }
    }

    await supabase
      .schema("billing")
      .from("active_gpu_pods")
      .delete()
      .eq("service_id", params.serviceId);

    return { finalCharge };
  },

  // ── Managed vector collections (service_id = collection UUID) ──────────────
  addActiveVectorCollection: async (params: {
    userId: string;
    serviceId: string;
    hourlyRate: number;
  }) => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("active_inference_vector")
      .insert({
        user_id: params.userId,
        service_id: params.serviceId,
        hourly_rate: params.hourlyRate,
        status: "active",
        last_billed_at: new Date().toISOString(),
      });
    if (error) throw new Error(`Failed to insert active_inference_vector: ${error.message}`);
  },

  closeActiveVectorCollection: async (params: { serviceId: string }): Promise<{ finalCharge: number }> => {
    const supabase = await createServiceClient();
    const { data: row, error: getErr } = await supabase
      .schema("billing")
      .from("active_inference_vector")
      .select("hourly_rate, last_billed_at")
      .eq("service_id", params.serviceId)
      .maybeSingle();

    if (getErr) throw new Error(`Failed to fetch active_inference_vector: ${getErr.message}`);

    let finalCharge = 0;
    if (row) {
      const rate = parseFloat(String(row.hourly_rate));
      if (rate > 0) {
        const lastBilledAt = row.last_billed_at as string | undefined;
        const last = lastBilledAt ? new Date(/[+-]\d{2}:?\d{2}$/.test(lastBilledAt) || lastBilledAt.endsWith("Z") ? lastBilledAt : `${lastBilledAt}Z`) : null;
        const hoursUsed = last ? Math.max(0, (Date.now() - last.getTime()) / 3_600_000) : 1;
        finalCharge = parseFloat((rate * hoursUsed).toFixed(8));
      }
    }

    await supabase
      .schema("billing")
      .from("active_inference_vector")
      .delete()
      .eq("service_id", params.serviceId);

    return { finalCharge };
  },

  // ── Compute / virtual servers (service_id = servers.billing_service_id) ────
  addActiveCompute: async (params: {
    userId: string;
    serviceId: string;
    hourlyRate: number;
  }) => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("active_compute")
      .insert({
        user_id: params.userId,
        service_id: params.serviceId,
        hourly_rate: params.hourlyRate,
        status: "active",
        last_billed_at: new Date().toISOString(),
      });
    if (error) throw new Error(`Failed to insert active_compute: ${error.message}`);
  },

  closeActiveCompute: async (params: { serviceId: string }): Promise<{ finalCharge: number }> => {
    const supabase = await createServiceClient();
    const { data: row, error: getErr } = await supabase
      .schema("billing")
      .from("active_compute")
      .select("hourly_rate, last_billed_at")
      .eq("service_id", params.serviceId)
      .maybeSingle();

    if (getErr) throw new Error(`Failed to fetch active_compute: ${getErr.message}`);

    let finalCharge = 0;
    if (row) {
      const rate = parseFloat(String(row.hourly_rate));
      if (rate > 0) {
        const lastBilledAt = row.last_billed_at as string | undefined;
        const last = lastBilledAt ? new Date(/[+-]\d{2}:?\d{2}$/.test(lastBilledAt) || lastBilledAt.endsWith("Z") ? lastBilledAt : `${lastBilledAt}Z`) : null;
        const hoursUsed = last ? Math.max(0, (Date.now() - last.getTime()) / 3_600_000) : 1;
        finalCharge = parseFloat((rate * hoursUsed).toFixed(8));
      }
    }

    await supabase
      .schema("billing")
      .from("active_compute")
      .delete()
      .eq("service_id", params.serviceId);

    return { finalCharge };
  },

  /**
   * Re-rate an active compute meter after a resize. Sets the new hourly rate
   * and advances last_billed_at to now so the new rate applies from the resize
   * moment. The cron meters continuously (rate x elapsed since last_billed_at)
   * and advances last_billed_at every run, so the un-charged pre-resize sliver
   * is at most one cron interval — immaterial. No-op if no active row exists.
   */
  rerateActiveCompute: async (params: {
    serviceId: string;
    hourlyRate: number;
  }): Promise<void> => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("active_compute")
      .update({
        hourly_rate: params.hourlyRate,
        last_billed_at: new Date().toISOString(),
      })
      .eq("service_id", params.serviceId);
    if (error) throw new Error(`Failed to re-rate active_compute: ${error.message}`);
  },
};
