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

const ensurePositiveAmount = (amount: number, operation: "Top-up" | "Deduction") => {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${operation} amount must be a positive number`);
  }
};

const isUniqueViolation = (error: { code?: string; message?: string } | null | undefined): boolean => {
  if (!error) return false;
  return error.code === "23505" || /duplicate key/i.test(error.message || "");
};

type RecurringInterval = "week" | "month" | "year";
type RecurringStatus =
  | "pending"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "trialing"
  | "paused";

interface RecurringTopupRecord {
  id: string;
  user_id: string;
  stripe_subscription_id: string | null;
  amount: number;
  currency: string;
  interval: RecurringInterval;
  status: RecurringStatus;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

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
    ensurePositiveAmount(amount, "Top-up");
    const supabase = await createServiceClient();
    const { data: existing } = await supabase
      .schema("billing")
      .from("user_credits")
      .select("credit_balance")
      .eq("user_id", userId)
      .maybeSingle();

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

    // Atomic increment — prevents race conditions with concurrent webhooks
    const { data, error } = await supabase.rpc("billing_topup", {
      p_user_id: userId,
      p_amount: amount,
    });

    if (error) {
      // Fallback to non-atomic update if RPC not available yet
      console.warn("[Billing] RPC billing_topup not available, using fallback:", error.message);
      const prevBal = existing.credit_balance ?? 0;
      const next = { credit_balance: prevBal + amount };
      const { data: fallbackData, error: fallbackErr } = await supabase
        .schema("billing")
        .from("user_credits")
        .update(next)
        .eq("user_id", userId)
        .select("credit_balance")
        .single();
      if (fallbackErr) throw new Error(`Top-up failed: ${fallbackErr.message}`);
      return {
        credit_balance: fallbackData?.credit_balance ?? next.credit_balance,
        promo_credits: 0,
        topup_credits: 0,
      };
    }

    return {
      credit_balance: data as number,
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
    ensurePositiveAmount(amount, "Deduction");
    const supabase = await createServiceClient();

    // Atomic deduction — prevents race conditions and overdraft
    const { data, error } = await supabase.rpc("billing_deduct", {
      p_user_id: userId,
      p_amount: amount,
    });
    if (error) console.warn("[Billing] deduct RPC error:", error.message);
    else console.log("[Billing] deduct result:", data);

    if (error) {
      // Fallback to non-atomic if RPC not available yet
      console.warn("[Billing] RPC billing_deduct not available, using fallback:", error.message);
      const bal = await Billing.get_balance(userId);
      if (bal < amount) throw new Error("Insufficient balance");
      const { data: fallbackData, error: fallbackErr } = await supabase
        .schema("billing")
        .from("user_credits")
        .update({ credit_balance: bal - amount })
        .eq("user_id", userId)
        .select("credit_balance")
        .single();
      if (fallbackErr) throw new Error(`Credit deduction failed: ${fallbackErr.message}`);
      return (fallbackData?.credit_balance as number) ?? bal - amount;
    }

    if (data === null || data < 0) {
      throw new Error("Insufficient balance");
    }
    return data as number;
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

  add_active_platform_app: async (params: {
    userId: string;
    serviceId: string;
    hourlyRate: number;
  }) => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("active_platform_apps")
      .insert({
        user_id: params.userId,
        service_id: params.serviceId,
        hourly_rate: params.hourlyRate,
        status: "active",
        last_billed_at: new Date().toISOString(),
      });
    if (error)
      throw new Error(`Failed to insert active_platform_apps: ${error.message}`);
  },

  /**
   * Update the hourly rate for an active platform app (used during resize)
   * This ensures the user is charged the correct rate after resizing
   */
  update_active_platform_app_rate: async (params: {
    serviceId: string;
    newHourlyRate: number;
  }): Promise<void> => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("active_platform_apps")
      .update({
        hourly_rate: params.newHourlyRate,
        updated_at: new Date().toISOString(),
      })
      .eq("service_id", params.serviceId)
      .eq("status", "active");

    if (error) {
      console.error(`[Billing] Failed to update platform app rate:`, error.message);
      throw new Error(`Failed to update hourly rate: ${error.message}`);
    }

    console.log(`[Billing] Updated platform app ${params.serviceId} hourly rate to ${params.newHourlyRate}`);
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
    type: "database" | "kubernetes" | "objectspace" | "spectrum" | "platform_apps",
    params: { userId: string; serviceId: string; failOnInsufficient?: boolean }
  ): Promise<{ charged: number; newBalance: number | null }> => {
    const supabase = await createServiceClient();
    const tableMap: Record<string, string> = {
      database: "active_database",
      kubernetes: "active_kubernetes",
      objectspace: "active_objectspace",
      spectrum: "active_spectrum",
      platform_apps: "active_platform_apps",
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
      .eq("user_id", params.userId)
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
        .eq("service_id", params.serviceId)
        .eq("user_id", params.userId);
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
      .eq("service_id", params.serviceId)
      .eq("user_id", params.userId);
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

  // ─── Stripe Integration Helpers ─────────────────────────────────────

  get_stripe_customer_id: async (userId: string): Promise<string | null> => {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .schema("billing")
      .from("user_credits")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .maybeSingle();
    return data?.stripe_customer_id ?? null;
  },

  save_stripe_customer_id: async (userId: string, stripeCustomerId: string): Promise<void> => {
    const supabase = await createServiceClient();
    const { data: existing } = await supabase
      .schema("billing")
      .from("user_credits")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .schema("billing")
        .from("user_credits")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("user_id", userId);
      if (error) throw new Error(`Failed to save stripe customer: ${error.message}`);
    } else {
      const { error } = await supabase
        .schema("billing")
        .from("user_credits")
        .insert({ user_id: userId, credit_balance: 0, stripe_customer_id: stripeCustomerId });
      if (error) throw new Error(`Failed to create user credits: ${error.message}`);
    }
  },

  save_transaction: async (params: {
    userId: string;
    stripeSessionId?: string;
    stripePaymentIntent?: string;
    stripeInvoiceId?: string;
    amount: number;
    currency?: string;
    status: "pending" | "completed" | "failed";
    type?: "topup" | "refund" | "coupon" | "recurring";
    balanceAfter?: number;
    description?: string;
    receiptUrl?: string;
  }): Promise<void> => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("transactions")
      .insert({
        user_id: params.userId,
        stripe_session_id: params.stripeSessionId ?? null,
        stripe_payment_intent: params.stripePaymentIntent ?? null,
        stripe_invoice_id: params.stripeInvoiceId ?? null,
        amount: params.amount,
        currency: params.currency ?? "usd",
        status: params.status,
        type: params.type ?? "topup",
        balance_after: params.balanceAfter ?? null,
        description: params.description ?? null,
        receipt_url: params.receiptUrl ?? null,
        completed_at: params.status === "completed" ? new Date().toISOString() : null,
      });
    if (error) throw new Error(`Failed to save transaction: ${error.message}`);
  },

  claim_session_transaction: async (params: {
    userId: string;
    stripeSessionId: string;
    amount: number;
    currency?: string;
    type?: "topup" | "refund" | "coupon" | "recurring";
    stripePaymentIntent?: string;
    description?: string;
  }): Promise<boolean> => {
    const supabase = await createServiceClient();
    const payload = {
      user_id: params.userId,
      stripe_session_id: params.stripeSessionId,
      stripe_payment_intent: params.stripePaymentIntent ?? null,
      stripe_invoice_id: null,
      amount: params.amount,
      currency: params.currency ?? "usd",
      status: "pending" as const,
      type: params.type ?? "topup",
      balance_after: null,
      description: params.description ?? null,
      receipt_url: null,
      completed_at: null,
    };

    const { error } = await supabase
      .schema("billing")
      .from("transactions")
      .insert(payload);

    if (!error) {
      return true;
    }

    if (!isUniqueViolation(error)) {
      throw new Error(`Failed to claim session transaction: ${error.message}`);
    }

    const existing = await Billing.get_transaction_by_session(params.stripeSessionId);
    if (!existing) {
      return false;
    }
    if (existing.status === "failed") {
      const { error: retryError } = await supabase
        .schema("billing")
        .from("transactions")
        .update({
          user_id: params.userId,
          stripe_payment_intent: params.stripePaymentIntent ?? null,
          amount: params.amount,
          currency: params.currency ?? "usd",
          status: "pending",
          type: params.type ?? "topup",
          description: params.description ?? null,
          receipt_url: null,
          balance_after: null,
          completed_at: null,
        })
        .eq("stripe_session_id", params.stripeSessionId)
        .eq("status", "failed");

      if (retryError) {
        throw new Error(`Failed to reclaim session transaction: ${retryError.message}`);
      }
      return true;
    }

    return false;
  },

  claim_invoice_transaction: async (params: {
    userId: string;
    stripeInvoiceId: string;
    amount: number;
    currency?: string;
    type?: "topup" | "refund" | "coupon" | "recurring";
    stripePaymentIntent?: string;
    description?: string;
  }): Promise<boolean> => {
    const supabase = await createServiceClient();
    const payload = {
      user_id: params.userId,
      stripe_session_id: null,
      stripe_payment_intent: params.stripePaymentIntent ?? null,
      stripe_invoice_id: params.stripeInvoiceId,
      amount: params.amount,
      currency: params.currency ?? "usd",
      status: "pending" as const,
      type: params.type ?? "recurring",
      balance_after: null,
      description: params.description ?? null,
      receipt_url: null,
      completed_at: null,
    };

    const { error } = await supabase
      .schema("billing")
      .from("transactions")
      .insert(payload);

    if (!error) {
      return true;
    }

    if (!isUniqueViolation(error)) {
      throw new Error(`Failed to claim invoice transaction: ${error.message}`);
    }

    const existing = await Billing.get_transaction_by_invoice(params.stripeInvoiceId);
    if (!existing) {
      return false;
    }
    if (existing.status === "failed") {
      const { error: retryError } = await supabase
        .schema("billing")
        .from("transactions")
        .update({
          user_id: params.userId,
          stripe_payment_intent: params.stripePaymentIntent ?? null,
          amount: params.amount,
          currency: params.currency ?? "usd",
          status: "pending",
          type: params.type ?? "recurring",
          description: params.description ?? null,
          receipt_url: null,
          balance_after: null,
          completed_at: null,
        })
        .eq("stripe_invoice_id", params.stripeInvoiceId)
        .eq("status", "failed");

      if (retryError) {
        throw new Error(`Failed to reclaim invoice transaction: ${retryError.message}`);
      }
      return true;
    }

    return false;
  },

  mark_session_transaction_completed: async (params: {
    stripeSessionId: string;
    stripePaymentIntent?: string;
    amount: number;
    currency?: string;
    type?: "topup" | "refund" | "coupon" | "recurring";
    balanceAfter?: number;
    description?: string;
    receiptUrl?: string;
  }): Promise<void> => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("transactions")
      .update({
        stripe_payment_intent: params.stripePaymentIntent ?? null,
        amount: params.amount,
        currency: params.currency ?? "usd",
        status: "completed",
        type: params.type ?? "topup",
        balance_after: params.balanceAfter ?? null,
        description: params.description ?? null,
        receipt_url: params.receiptUrl ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("stripe_session_id", params.stripeSessionId);

    if (error) {
      throw new Error(`Failed to complete session transaction: ${error.message}`);
    }
  },

  mark_invoice_transaction_completed: async (params: {
    stripeInvoiceId: string;
    stripePaymentIntent?: string;
    amount: number;
    currency?: string;
    type?: "topup" | "refund" | "coupon" | "recurring";
    balanceAfter?: number;
    description?: string;
    receiptUrl?: string;
  }): Promise<void> => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("transactions")
      .update({
        stripe_payment_intent: params.stripePaymentIntent ?? null,
        amount: params.amount,
        currency: params.currency ?? "usd",
        status: "completed",
        type: params.type ?? "recurring",
        balance_after: params.balanceAfter ?? null,
        description: params.description ?? null,
        receipt_url: params.receiptUrl ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("stripe_invoice_id", params.stripeInvoiceId);

    if (error) {
      throw new Error(`Failed to complete invoice transaction: ${error.message}`);
    }
  },

  mark_session_transaction_failed: async (stripeSessionId: string, description?: string): Promise<void> => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("transactions")
      .update({
        status: "failed",
        description: description ?? "Webhook processing failed",
      })
      .eq("stripe_session_id", stripeSessionId)
      .eq("status", "pending");

    if (error) {
      console.warn("[Billing] Failed to mark session transaction as failed:", error.message);
    }
  },

  mark_invoice_transaction_failed: async (stripeInvoiceId: string, description?: string): Promise<void> => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("transactions")
      .update({
        status: "failed",
        description: description ?? "Webhook processing failed",
      })
      .eq("stripe_invoice_id", stripeInvoiceId)
      .eq("status", "pending");

    if (error) {
      console.warn("[Billing] Failed to mark invoice transaction as failed:", error.message);
    }
  },

  get_transaction_by_session: async (stripeSessionId: string): Promise<{ id: string; status: string } | null> => {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .schema("billing")
      .from("transactions")
      .select("id, status")
      .eq("stripe_session_id", stripeSessionId)
      .maybeSingle();
    return data ?? null;
  },

  get_transaction_by_invoice: async (stripeInvoiceId: string): Promise<{ id: string; status: string } | null> => {
    const supabase = await createServiceClient();
    const { data } = await supabase
      .schema("billing")
      .from("transactions")
      .select("id, status")
      .eq("stripe_invoice_id", stripeInvoiceId)
      .maybeSingle();
    return data ?? null;
  },

  get_recurring_topup: async (userId: string): Promise<RecurringTopupRecord | null> => {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .schema("billing")
      .from("recurring_topups")
      .select("id, user_id, stripe_subscription_id, amount, currency, interval, status, cancel_at_period_end, canceled_at, created_at, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[Billing] Failed to fetch recurring topup:", error.message);
      return null;
    }

    return data as RecurringTopupRecord | null;
  },

  get_recurring_topup_by_subscription: async (
    stripeSubscriptionId: string
  ): Promise<RecurringTopupRecord | null> => {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .schema("billing")
      .from("recurring_topups")
      .select("id, user_id, stripe_subscription_id, amount, currency, interval, status, cancel_at_period_end, canceled_at, created_at, updated_at")
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .maybeSingle();

    if (error) {
      console.error("[Billing] Failed to fetch recurring topup by subscription:", error.message);
      return null;
    }

    return data as RecurringTopupRecord | null;
  },

  upsert_recurring_topup: async (params: {
    userId: string;
    amount: number;
    interval: RecurringInterval;
    currency?: string;
    status?: RecurringStatus;
    stripeSubscriptionId?: string | null;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: string | null;
  }): Promise<void> => {
    const supabase = await createServiceClient();
    const now = new Date().toISOString();
    const payload = {
      user_id: params.userId,
      stripe_subscription_id: params.stripeSubscriptionId ?? null,
      amount: params.amount,
      currency: params.currency ?? "usd",
      interval: params.interval,
      status: params.status ?? "pending",
      cancel_at_period_end: params.cancelAtPeriodEnd ?? false,
      canceled_at: params.canceledAt ?? null,
      updated_at: now,
    };

    const { error } = await supabase
      .schema("billing")
      .from("recurring_topups")
      .upsert(payload, { onConflict: "user_id" });

    if (error) {
      throw new Error(`Failed to upsert recurring topup: ${error.message}`);
    }
  },

  update_recurring_topup_by_user: async (params: {
    userId: string;
    status?: RecurringStatus;
    stripeSubscriptionId?: string | null;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: string | null;
  }): Promise<void> => {
    const supabase = await createServiceClient();
    const updatePayload: {
      status?: RecurringStatus;
      stripe_subscription_id?: string | null;
      cancel_at_period_end?: boolean;
      canceled_at?: string | null;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (params.status !== undefined) {
      updatePayload.status = params.status;
    }
    if (params.stripeSubscriptionId !== undefined) {
      updatePayload.stripe_subscription_id = params.stripeSubscriptionId;
    }
    if (params.cancelAtPeriodEnd !== undefined) {
      updatePayload.cancel_at_period_end = params.cancelAtPeriodEnd;
    }
    if (params.canceledAt !== undefined) {
      updatePayload.canceled_at = params.canceledAt;
    }

    const { error } = await supabase
      .schema("billing")
      .from("recurring_topups")
      .update(updatePayload)
      .eq("user_id", params.userId);

    if (error) {
      throw new Error(`Failed to update recurring topup: ${error.message}`);
    }
  },

  update_recurring_topup_status_by_subscription: async (params: {
    stripeSubscriptionId: string;
    status?: RecurringStatus;
    cancelAtPeriodEnd?: boolean;
    canceledAt?: string | null;
  }): Promise<void> => {
    const supabase = await createServiceClient();
    const updatePayload: {
      status?: RecurringStatus;
      cancel_at_period_end?: boolean;
      canceled_at?: string | null;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (params.status !== undefined) {
      updatePayload.status = params.status;
    }
    if (params.cancelAtPeriodEnd !== undefined) {
      updatePayload.cancel_at_period_end = params.cancelAtPeriodEnd;
    }
    if (params.canceledAt !== undefined) {
      updatePayload.canceled_at = params.canceledAt;
    }

    const { error } = await supabase
      .schema("billing")
      .from("recurring_topups")
      .update(updatePayload)
      .eq("stripe_subscription_id", params.stripeSubscriptionId);

    if (error) {
      throw new Error(`Failed to update recurring topup by subscription: ${error.message}`);
    }
  },

  get_transactions: async (
    userId: string,
    opts?: {
      limit?: number;
      offset?: number;
      status?: string;
      type?: string;
      from?: string;
      to?: string;
    }
  ): Promise<{
    transactions: Array<{
      id: string;
      stripe_session_id: string | null;
      stripe_invoice_id: string | null;
      amount: number;
      currency: string;
      status: string;
      type: string;
      balance_after: number | null;
      description: string | null;
      receipt_url: string | null;
      created_at: string;
    }>;
    total: number;
  }> => {
    const supabase = await createServiceClient();
    const limit = opts?.limit ?? 20;
    const offset = opts?.offset ?? 0;

    let query = supabase
      .schema("billing")
      .from("transactions")
      .select("id, stripe_session_id, stripe_invoice_id, amount, currency, status, type, balance_after, description, receipt_url, created_at", { count: "exact" })
      .eq("user_id", userId);

    if (opts?.status && ["pending", "completed", "failed"].includes(opts.status)) {
      query = query.eq("status", opts.status);
    }
    if (opts?.type && ["topup", "refund", "coupon", "recurring"].includes(opts.type)) {
      query = query.eq("type", opts.type);
    }
    if (opts?.from) {
      query = query.gte("created_at", opts.from);
    }
    if (opts?.to) {
      query = query.lte("created_at", opts.to);
    }

    const { data, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    return { transactions: data ?? [], total: count ?? 0 };
  },

  /**
   * Stop billing for a Kubernetes cluster and charge for remaining time
   */
  remove_active_kubernetes: async (serviceId: string): Promise<void> => {
    // We need userId to properly close the service, but we can look it up from the active record
    const supabase = await createServiceClient();
    const { data: active } = await supabase
      .schema("billing")
      .from("active_kubernetes")
      .select("user_id")
      .eq("service_id", serviceId)
      .maybeSingle();

    if (!active) {
      console.warn(`[Billing.remove_active_kubernetes] No active record found for ${serviceId}`);
      return;
    }

    await Billing.close_active_service("kubernetes", {
      userId: active.user_id,
      serviceId,
      failOnInsufficient: false,
    });
  },
};
