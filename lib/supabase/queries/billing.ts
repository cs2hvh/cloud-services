import { createServiceClient } from "../server";
import { Promocode } from "../types";

interface PromocodeRedemptionEntry {
  userId?: string;
  email?: string;
  redeemedAt?: string;
}

const isPromocodeRedemptionEntry = (
  value: unknown
): value is PromocodeRedemptionEntry => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const hasUserId = typeof record.userId === "string";
  const hasEmail = typeof record.email === "string";
  const redeemedAtValid =
    record.redeemedAt === undefined || typeof record.redeemedAt === "string";
  return redeemedAtValid && (hasUserId || hasEmail);
};

const getPromocodeRedemptions = (
  value: Promocode["redeem_by"]
): PromocodeRedemptionEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isPromocodeRedemptionEntry);
};

export const Billing = {
  get_balance: async (userId: string): Promise<number> => {
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

  get_user_credits: async (
    userId: string
  ): Promise<{
    credit_balance: number;
    promo_credits: number;
    topup_credits: number;
  }> => {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .schema("billing")
      .from("user_credits")
      .select("credit_balance")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) {
      console.log(error?.message, "error getting balance");
      return { credit_balance: 0, promo_credits: 0, topup_credits: 0 };
    }

    // Calculate promo credits from redeemed coupons
    const { data: promos } = await supabase
      .schema("billing")
      .from("promocodes")
      .select("amount, redeem_by");

    const promoCredits = (promos ?? []).reduce((total, promo) => {
      const userRedeemed = getPromocodeRedemptions(promo.redeem_by).some(
        (entry) => entry.userId === userId
      );
      return userRedeemed ? total + (promo.amount ?? 0) : total;
    }, 0);

    const creditBalance = data.credit_balance ?? 0;
    const topupCredits = Math.max(0, creditBalance - promoCredits);

    console.log(
      creditBalance,
      "data.credit_balance",
      promoCredits,
      "promo_credits",
      topupCredits,
      "topup_credits"
    );
    return {
      credit_balance: creditBalance,
      promo_credits: promoCredits,
      topup_credits: topupCredits,
    };
  },

  topup: async (
    userId: string,
    amount: number
  ): Promise<{
    credit_balance: number;
    promo_credits?: number;
    topup_credits?: number;
  }> => {
    const supabase = await createServiceClient();
    const { data: existing } = await supabase
      .schema("billing")
      .from("user_credits")
      .select("credit_balance")
      .eq("user_id", userId)
      .maybeSingle();

    const prevBal = existing?.credit_balance ?? 0;
    // const prevTop = (existing as any)?.topup_credits ?? 0;

    if (!existing) {
      console.log("user has no existing credits, creating new record");
      const { data, error } = await supabase
        .schema("billing")
        .from("user_credits")
        .insert({ user_id: userId, credit_balance: amount })
        .select("credit_balance")
        .single();
      if (error) throw new Error(`Top-up failed: ${error.message}`);
      return {
        credit_balance: data?.credit_balance ?? amount,
        promo_credits: 0,
        topup_credits: 0,
      };
    }

    const next = {
      credit_balance: prevBal + amount,
    };

    const { data, error } = await supabase
      .schema("billing")
      .from("user_credits")
      .update(next)
      .eq("user_id", userId)
      .select("credit_balance")
      .single();
    if (error) throw new Error(`Top-up failed: ${error.message}`);
    return {
      credit_balance: data?.credit_balance ?? next.credit_balance,
      promo_credits: 0,
      topup_credits: 0,
    };
  },

  has_balance: async (
    userId: string,
    requiredAmount: number
  ): Promise<boolean> => {
    const bal = await Billing.get_balance(userId);
    return bal >= requiredAmount;
  },

  deduct: async (userId: string, amount: number): Promise<number> => {
    // console.log(amount,"amount to deduct")
    const supabase = await createServiceClient();
    const bal = await Billing.get_balance(userId);
    if (bal < amount) throw new Error("Insufficient balance");
    const { data, error } = await supabase
      .schema("billing")
      .from("user_credits")
      .update({ credit_balance: bal - amount })
      .eq("user_id", userId)
      .select("credit_balance")
      .single();
    if (error) throw new Error(`Credit deduction failed: ${error.message}`);
    return (data?.credit_balance as number) ?? bal - amount;
  },

  add_active_kubernetes: async (params: {
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
    if (error)
      throw new Error(`Failed to insert active_kubernetes: ${error.message}`);
  },
  add_active_database: async (params: {
    userId: string;
    serviceId: string;
    hourlyRate: number;
  }) => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("active_database")
      .insert({
        user_id: params.userId,
        service_id: params.serviceId,
        hourly_rate: params.hourlyRate,
        status: "active",
        last_billed_at: new Date().toISOString(),
      });
    if (error)
      throw new Error(`Failed to insert active_database: ${error.message}`);
  },
  add_active_objectspace: async (params: {
    userId: string;
    serviceId: string;
    hourlyRate: number;
  }) => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("active_objectspace")
      .insert({
        user_id: params.userId,
        service_id: params.serviceId,
        hourly_rate: params.hourlyRate,
        status: "active",
        last_billed_at: new Date().toISOString(),
      });
    if (error)
      throw new Error(`Failed to insert active_objectspace: ${error.message}`);
  },
  add_active_spectrum: async (params: {
    userId: string;
    serviceId: string;
    hourlyRate: number;
  }) => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("active_spectrum")
      .insert({
        user_id: params.userId,
        service_id: params.serviceId,
        hourly_rate: params.hourlyRate,
        status: "active",
        last_billed_at: new Date().toISOString(),
      });
    if (error)
      throw new Error(`Failed to insert active_spectrum: ${error.message}`);
  },

  // Internal helper: compute prorated charge for remaining fraction of hour
  _computeProratedCharge: (
    hourlyRate: number | string,
    lastBilledAt?: string | Date,
    now: Date = new Date()
  ): number => {
    const rate =
      typeof hourlyRate === "number"
        ? hourlyRate
        : parseFloat(String(hourlyRate));
    if (!rate || isNaN(rate) || rate <= 0) return 0;

    let last: Date | null = null;
    if (lastBilledAt) {
      if (typeof lastBilledAt === "string") {
        const str = lastBilledAt;
        const hasTZ = str.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(str);
        last = new Date(hasTZ ? str : `${str}Z`);
      } else {
        last = lastBilledAt;
      }
    }

    // Bill for elapsed time since last_billed_at; if no last, bill 1 full hour
    const hoursUsed = last
      ? Math.max(0, (now.getTime() - last.getTime()) / (1000 * 60 * 60))
      : 1;
    const cost = Number((hoursUsed * rate).toFixed(6));
    return cost;
  },

  // Generic closer for active services in billing schema
  close_active_service: async (
    type: "database" | "kubernetes" | "objectspace" | "spectrum",
    params: { userId: string; serviceId: string; failOnInsufficient?: boolean }
  ): Promise<{ charged: number; newBalance: number | null }> => {
    const supabase = await createServiceClient();
    const tableMap: Record<string, string> = {
      database: "active_database",
      kubernetes: "active_kubernetes",
      objectspace: "active_objectspace",
      spectrum: "active_spectrum",
    };
    const table = tableMap[type];
    if (!table) {
      console.error(
        `[Billing.close_active_service] Unknown service type:`,
        type
      );
      throw new Error(`Unknown service type: ${type}`);
    }

    console.log(`[Billing.close_active_service] Fetching active row`, {
      type,
      table,
      userId: params.userId,
      serviceId: params.serviceId,
    });
    // Fetch active row
    const { data: row, error: getErr } = await supabase
      .schema("billing")
      .from(table)
      .select("user_id, service_id, hourly_rate, last_billed_at")
      .eq("service_id", params.serviceId)
      //.eq("user_id", params.userId)
      .maybeSingle();

    if (getErr) {
      console.error(
        `[Billing.close_active_service] Supabase fetch error for ${type}:`,
        getErr.message
      );
      throw new Error(`Failed to fetch active ${type}: ${getErr.message}`);
    }

    console.log(`[Billing.close_active_service] Active row`, row);
    if (!row) {
      // Nothing to charge, but still attempt cleanup just in case of stale state
      console.log(
        `[Billing.close_active_service] No active row found; performing cleanup delete`,
        { table, userId: params.userId, serviceId: params.serviceId }
      );
      await supabase
        .schema("billing")
        .from(table)
        .delete()
        .eq("service_id", params.serviceId);
      //.eq("user_id", row?.user_id);
      return { charged: 0, newBalance: null };
    }

    const hourlyRate = row?.hourly_rate as number;
    const lastBilledAt = row?.last_billed_at as string | undefined;
    const charge = Billing._computeProratedCharge(hourlyRate, lastBilledAt);

    console.log(`[Billing.close_active_service] Computed charge`, {
      hourlyRate,
      lastBilledAt,
      charge,
    });

    // Deduct credits
    let newBalance: number | null = null;
    if (charge > 0) {
      try {
        newBalance = await Billing.deduct(row.user_id, charge);
        console.log(`[Billing.close_active_service] Deduction successful`, {
          userId: params.userId,
          charge,
          newBalance,
        });
      } catch (error) {
        if (params.failOnInsufficient) {
          throw new Error("Insufficient balance");
        }
        // If not failing hard, skip deduction and proceed to cleanup
        newBalance = null;
        console.warn(
          `[Billing.close_active_service] Deduction skipped due to error`,
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }

    // Remove active row to stop future accrual
    const { error: delErr } = await supabase
      .schema("billing")
      .from(table)
      .delete()
      .eq("service_id", params.serviceId);
    //.eq("user_id", params.userId);
    if (delErr) {
      console.error(
        `[Billing.close_active_service] Supabase delete error for ${type}:`,
        delErr.message
      );
      throw new Error(`Failed to delete active ${type}: ${delErr.message}`);
    }

    console.log(`[Billing.close_active_service] Closed service successfully`, {
      type,
      charged: charge,
      newBalance,
    });

    return { charged: charge, newBalance };
  },
};
