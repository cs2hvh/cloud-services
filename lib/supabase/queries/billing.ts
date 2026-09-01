import { createServiceClient } from "../server";
import { Promocode } from "../types";
import { resolveGraceForUserAfterTopup } from "@/lib/billing/grace/recovery";
import { serviceLabel } from "@/lib/billing/service-label";

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

const isUniqueViolation = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  return (
    maybeError.code === "23505" ||
    (typeof maybeError.message === "string" &&
      maybeError.message.toLowerCase().includes("duplicate key"))
  );
};

const isTransactionHistorySchemaMismatch = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  const message = maybeError.message?.toLowerCase() ?? "";
  const mentionsNewColumn =
    message.includes("service_id") ||
    message.includes("service_type") ||
    message.includes("period_start") ||
    message.includes("period_end") ||
    message.includes("metadata");

  // The account_ledger VIEW is newer than the extended columns, so a database
  // that predates it fails with "relation does not exist" (42P01 / PGRST205)
  // rather than a column error. That is the same situation — an older schema —
  // and has to reach the same legacy fallback, or the statement page 500s
  // instead of degrading.
  const missingLedgerView =
    message.includes("account_ledger") &&
    (maybeError.code === "42P01" ||
      maybeError.code === "PGRST205" ||
      message.includes("does not exist") ||
      message.includes("could not find the table"));

  return Boolean(
    missingLedgerView ||
      (mentionsNewColumn &&
        (maybeError.code === "PGRST204" ||
          maybeError.code === "42703" ||
          message.includes("could not find the") ||
          message.includes("column")))
  );
};

const isTransactionTypeConstraintMismatch = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  const message = maybeError.message?.toLowerCase() ?? "";
  return (
    maybeError.code === "23514" ||
    message.includes("transactions_type_check") ||
    (message.includes("check constraint") && message.includes("type"))
  );
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

type BillingTransactionStatus = "pending" | "completed" | "failed";
type BillingTransactionType =
  | "topup"
  | "refund"
  | "coupon"
  | "recurring"
  | "setup"
  | "usage"
  | "purchase";
type BillableServiceType =
  | "database"
  | "kubernetes"
  | "objectspace"
  | "spectrum"
  | "platform_apps"
  | "domain"
  | "gpu_pod"
  | "inference_finetune"
  | "inference_serving"
  | "inference_deployment"
  | "inference_vector"
  | "compute"
  | "custom_image"
  | "game_server";

type TransactionHistoryMode = "unknown" | "legacy" | "service_ledger";
const SERVICE_LEDGER_REPROBE_INTERVAL_MS = 60_000;

const LEGACY_TRANSACTION_TYPES = new Set<BillingTransactionType>([
  "topup",
  "refund",
  "coupon",
  "recurring",
]);
const SERVICE_LEDGER_TRANSACTION_TYPES = new Set<BillingTransactionType>([
  "setup",
  "usage",
  "purchase",
]);

let transactionHistoryMode: TransactionHistoryMode = "unknown";
let hasWarnedServiceLedgerUnavailable = false;
let lastServiceLedgerMismatchAt = 0;

function transactionNeedsServiceLedger(params: {
  type?: BillingTransactionType;
  serviceId?: string;
  serviceType?: BillableServiceType;
  periodStart?: string | null;
  periodEnd?: string | null;
  metadata?: Record<string, unknown>;
}): boolean {
  if (params.type && SERVICE_LEDGER_TRANSACTION_TYPES.has(params.type)) {
    return true;
  }

  return Boolean(
    params.serviceId ||
      params.serviceType ||
      params.periodStart ||
      params.periodEnd ||
      (params.metadata && Object.keys(params.metadata).length > 0)
  );
}

function warnServiceLedgerUnavailable(context: string, error?: unknown) {
  if (hasWarnedServiceLedgerUnavailable) return;
  hasWarnedServiceLedgerUnavailable = true;
  console.warn(
    `[Billing] Service transaction history is unavailable until the billing.transactions ledger migration is applied. Skipping ${context}.`,
    error instanceof Error ? error.message : error
  );
}

function shouldAttemptServiceLedger(): boolean {
  if (transactionHistoryMode !== "legacy") return true;
  return Date.now() - lastServiceLedgerMismatchAt >= SERVICE_LEDGER_REPROBE_INTERVAL_MS;
}

function markServiceLedgerAvailable() {
  transactionHistoryMode = "service_ledger";
  hasWarnedServiceLedgerUnavailable = false;
  lastServiceLedgerMismatchAt = 0;
}

function markServiceLedgerLegacy() {
  transactionHistoryMode = "legacy";
  lastServiceLedgerMismatchAt = Date.now();
}

async function triggerGraceRecoveryAfterCreditIncrease(userId: string) {
  try {
    const result = await resolveGraceForUserAfterTopup({ userId });
    if (result.restoredCount > 0) {
      console.log(
        `[Billing.topup] Restored ${result.restoredCount} grace lifecycle entr${
          result.restoredCount === 1 ? "y" : "ies"
        } for user ${userId}`
      );
    }
  } catch (error) {
    console.warn(
      "[Billing.topup] Grace recovery hook failed:",
      error instanceof Error ? error.message : String(error)
    );
  }
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
    let topupResult: {
      credit_balance: number;
      promo_credits?: number;
      topup_credits?: number;
    };

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
      topupResult = {
        credit_balance: data?.credit_balance ?? amount,
        promo_credits: 0,
        topup_credits: 0,
      };
    } else {
      // Atomic increment - prevents race conditions with concurrent webhooks
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
        topupResult = {
          credit_balance: fallbackData?.credit_balance ?? next.credit_balance,
          promo_credits: 0,
          topup_credits: 0,
        };
      } else {
        topupResult = {
          credit_balance: data as number,
          promo_credits: 0,
          topup_credits: 0,
        };
      }
    }

    await triggerGraceRecoveryAfterCreditIncrease(userId);
    return topupResult;
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

    // Check if an active row already exists for this service
    const { data: existing } = await supabase
      .schema("billing")
      .from("active_kubernetes")
      .select("service_id")
      .eq("service_id", params.serviceId)
      .maybeSingle();

    if (existing) {
      // Row already exists — update rate instead of inserting a duplicate
      const { error: updErr } = await supabase
        .schema("billing")
        .from("active_kubernetes")
        .update({ hourly_rate: params.hourlyRate })
        .eq("service_id", params.serviceId);
      if (updErr)
        throw new Error(`Failed to update active_kubernetes: ${updErr.message}`);
      console.log(`[Billing.add_active_kubernetes] Row already exists for ${params.serviceId}, updated rate to ${params.hourlyRate}`);
      return;
    }

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

  get_active_platform_app: async (params: {
    serviceId: string;
    userId?: string;
  }): Promise<{
    success: boolean;
    data?: {
      id: string;
      service_id: string;
      user_id: string;
      hourly_rate: number;
      status: string;
      created_at: string | null;
      updated_at: string | null;
      last_billed_at: string | null;
    } | null;
    error?: string;
  }> => {
    try {
      const supabase = await createServiceClient();
      let query = supabase
        .schema("billing")
        .from("active_platform_apps")
        .select("*")
        .eq("service_id", params.serviceId)
        .eq("status", "active");

      if (params.userId) {
        query = query.eq("user_id", params.userId);
      }

      const { data, error } = await query.maybeSingle();
      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: data ?? null };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  activate_platform_app: async (params: {
    userId: string;
    serviceId: string;
    initialCost: number;
    hourlyRate: number;
  }): Promise<{
    activated: boolean;
    alreadyActive: boolean;
    newBalance: number | null;
  }> => {
    const existing = await Billing.get_active_platform_app({
      serviceId: params.serviceId,
      userId: params.userId,
    });

    if (!existing.success) {
      throw new Error(existing.error || "Failed to check active platform app billing");
    }

    if (existing.data) {
      return {
        activated: false,
        alreadyActive: true,
        newBalance: null,
      };
    }

    let newBalance: number | null = null;
    if (params.initialCost > 0) {
      try {
        newBalance = await Billing.deduct(params.userId, params.initialCost);
      } catch (error) {
        throw new Error(
          `Failed to deduct initial platform app charge: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    if (params.initialCost > 0) {
      try {
        await Billing.save_transaction({
          userId: params.userId,
          amount: params.initialCost,
          status: "completed",
          type: "setup",
          balanceAfter: newBalance,
          serviceId: params.serviceId,
          serviceType: "platform_apps",
          description: "Initial platform app setup charge",
        });
      } catch (error) {
        console.warn(
          "[Billing.activate_platform_app] Failed to record setup transaction:",
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    try {
      await Billing.add_active_platform_app({
        userId: params.userId,
        serviceId: params.serviceId,
        hourlyRate: params.hourlyRate,
      });
      return {
        activated: true,
        alreadyActive: false,
        newBalance,
      };
    } catch (error) {
      const raceLostToExistingActiveRow = isUniqueViolation(error);
      try {
        if (params.initialCost > 0) {
          const refundResult = await Billing.topup(params.userId, params.initialCost);
          try {
            await Billing.save_transaction({
              userId: params.userId,
              amount: params.initialCost,
              status: "completed",
              type: "refund",
              balanceAfter: refundResult.credit_balance,
              serviceId: params.serviceId,
              serviceType: "platform_apps",
              description: raceLostToExistingActiveRow
                ? "Platform app setup charge refunded after duplicate activation race"
                : "Platform app setup charge refunded after billing registration failed",
            });
          } catch (txnError) {
            console.warn(
              "[Billing.activate_platform_app] Failed to record refund transaction:",
              txnError instanceof Error ? txnError.message : String(txnError)
            );
          }
        }
      } catch (refundError) {
        throw new Error(
          `Failed to create active platform app billing row after deducting credits${
            raceLostToExistingActiveRow ? " because another activation won the race" : ""
          }, and refund also failed: ${
            refundError instanceof Error ? refundError.message : String(refundError)
          }`
        );
      }

      if (raceLostToExistingActiveRow) {
        return {
          activated: false,
          alreadyActive: true,
          newBalance: null,
        };
      }

      throw new Error(
        `Failed to create active platform app billing row after deducting credits; initial charge was refunded: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  },

  /**
   * Update the hourly rate for an active platform app (used during resize)
   * This ensures the user is charged the correct rate after resizing
   */
  update_active_database_rate: async (params: {
    serviceId: string;
    newHourlyRate: number;
  }): Promise<{ updated: boolean }> => {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .schema("billing")
      .from("active_database")
      .update({
        hourly_rate: params.newHourlyRate,
        updated_at: new Date().toISOString(),
      })
      .eq("service_id", params.serviceId)
      .eq("status", "active")
      .select("service_id");

    if (error) {
      console.error(`[Billing] Failed to update database rate:`, error.message);
      throw new Error(`Failed to update hourly rate: ${error.message}`);
    }

    if (!data || data.length === 0) {
      console.log(
        `[Billing] No active database billing row found for ${params.serviceId}; skipping hourly rate update`
      );
      return { updated: false };
    }

    console.log(`[Billing] Updated database ${params.serviceId} hourly rate to ${params.newHourlyRate}`);
    return { updated: true };
  },

  update_active_platform_app_rate: async (params: {
    serviceId: string;
    newHourlyRate: number;
  }): Promise<{ updated: boolean }> => {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .schema("billing")
      .from("active_platform_apps")
      .update({
        hourly_rate: params.newHourlyRate,
        updated_at: new Date().toISOString(),
      })
      .eq("service_id", params.serviceId)
      .eq("status", "active")
      .select("service_id");

    if (error) {
      console.error(`[Billing] Failed to update platform app rate:`, error.message);
      throw new Error(`Failed to update hourly rate: ${error.message}`);
    }

    if (!data || data.length === 0) {
      console.log(
        `[Billing] No active platform app billing row found for ${params.serviceId}; skipping hourly rate update`
      );
      return { updated: false };
    }

    console.log(`[Billing] Updated platform app ${params.serviceId} hourly rate to ${params.newHourlyRate}`);
    return { updated: true };
  },

  update_active_kubernetes_rate: async (params: {
    serviceId: string;
    newHourlyRate: number;
  }): Promise<{ updated: boolean }> => {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .schema("billing")
      .from("active_kubernetes")
      .update({
        hourly_rate: params.newHourlyRate,
        updated_at: new Date().toISOString(),
      })
      .eq("service_id", params.serviceId)
      .eq("status", "active")
      .select("service_id");

    if (error) {
      console.error(`[Billing] Failed to update kubernetes rate:`, error.message);
      throw new Error(`Failed to update hourly rate: ${error.message}`);
    }

    if (!data || data.length === 0) {
      console.log(
        `[Billing] No active kubernetes billing row found for ${params.serviceId}; skipping hourly rate update`
      );
      return { updated: false };
    }

    console.log(`[Billing] Updated kubernetes ${params.serviceId} hourly rate to ${params.newHourlyRate}`);
    return { updated: true };
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
    let deductionApplied = false;
    if (charge > 0) {
      try {
        newBalance = await Billing.deduct(row.user_id, charge);
        deductionApplied = true;
        console.log(`[Billing.close_active_service] Deduction successful`, {
          userId: params.userId,
          charge,
          newBalance,
        });
        try {
          await Billing.save_transaction({
            userId: row.user_id,
            amount: charge,
            status: "completed",
            type: "usage",
            balanceAfter: newBalance,
            serviceId: params.serviceId,
            serviceType: type,
            periodStart: lastBilledAt,
            periodEnd: new Date().toISOString(),
            description: `Final prorated ${serviceLabel(type)} usage charge`,
          });
        } catch (txnError) {
          console.warn(
            "[Billing.close_active_service] Failed to record usage transaction:",
            txnError instanceof Error ? txnError.message : String(txnError)
          );
        }
      } catch (error) {
        if (params.failOnInsufficient) {
          throw new Error("Insufficient balance");
        }
        // If not failing hard, skip deduction and proceed to cleanup.
        newBalance = null;
        console.warn(
          `[Billing.close_active_service] Deduction skipped due to error`,
          { error: error instanceof Error ? error.message : String(error) }
        );
        // L5: record the unpaid final charge as a 'failed' usage row (arrears)
        // instead of silently dropping it, so the owed amount stays observable and
        // can be settled on a later top-up rather than written off.
        try {
          await Billing.save_transaction({
            userId: row.user_id,
            amount: charge,
            status: "failed",
            type: "usage",
            balanceAfter: null,
            serviceId: params.serviceId,
            serviceType: type,
            periodStart: lastBilledAt,
            periodEnd: new Date().toISOString(),
            description: `Unpaid final prorated ${serviceLabel(type)} usage charge (insufficient balance at teardown)`,
          });
        } catch (txnError) {
          console.warn(
            "[Billing.close_active_service] Failed to record arrears transaction:",
            txnError instanceof Error ? txnError.message : String(txnError)
          );
        }
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
      if (deductionApplied && charge > 0) {
        try {
          const refundResult = await Billing.topup(row.user_id, charge);
          try {
            await Billing.save_transaction({
              userId: row.user_id,
              amount: charge,
              status: "completed",
              type: "refund",
              balanceAfter: refundResult.credit_balance,
              serviceId: params.serviceId,
              serviceType: type,
              description: `Refund for ${type.replace("_", " ")} final charge after cleanup failure`,
            });
          } catch (txnError) {
            console.warn(
              "[Billing.close_active_service] Failed to record refund transaction:",
              txnError instanceof Error ? txnError.message : String(txnError)
            );
          }
        } catch (refundError) {
          console.error(
            `[Billing.close_active_service] Failed to refund charge after delete error for ${type}:`,
            refundError instanceof Error ? refundError.message : String(refundError)
          );
          throw new Error(
            `Failed to delete active ${type}: ${delErr.message}. Charge refund also failed.`
          );
        }
      }
      console.error(
        `[Billing.close_active_service] Supabase delete error for ${type}:`,
        delErr.message
      );
      throw new Error(
        `Failed to delete active ${type}: ${delErr.message}. Charge of ${charge} was refunded.`
      );
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
    status: BillingTransactionStatus;
    type?: BillingTransactionType;
    balanceAfter?: number | null;
    description?: string;
    receiptUrl?: string;
    serviceId?: string;
    serviceType?: BillableServiceType;
    periodStart?: string | null;
    periodEnd?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> => {
    const supabase = await createServiceClient();
    const completedAt = params.status === "completed" ? new Date().toISOString() : null;
    const requestedType = params.type ?? "topup";
    const needsServiceLedger = transactionNeedsServiceLedger({
      type: requestedType,
      serviceId: params.serviceId,
      serviceType: params.serviceType,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      metadata: params.metadata,
    });

    const payload = {
      user_id: params.userId,
      stripe_session_id: params.stripeSessionId ?? null,
      stripe_payment_intent: params.stripePaymentIntent ?? null,
      stripe_invoice_id: params.stripeInvoiceId ?? null,
      amount: params.amount,
      currency: params.currency ?? "usd",
      status: params.status,
      type: requestedType,
      balance_after: params.balanceAfter ?? null,
      description: params.description ?? null,
      receipt_url: params.receiptUrl ?? null,
      service_id: params.serviceId ?? null,
      service_type: params.serviceType ?? null,
      period_start: params.periodStart ?? null,
      period_end: params.periodEnd ?? null,
      metadata: params.metadata ?? {},
      completed_at: completedAt,
    };

    const legacyPayload = {
        user_id: params.userId,
        stripe_session_id: params.stripeSessionId ?? null,
        stripe_payment_intent: params.stripePaymentIntent ?? null,
        stripe_invoice_id: params.stripeInvoiceId ?? null,
        amount: params.amount,
        currency: params.currency ?? "usd",
        status: params.status,
        type: requestedType,
        balance_after: params.balanceAfter ?? null,
        description: params.description ?? null,
        receipt_url: params.receiptUrl ?? null,
        completed_at: completedAt,
      };

    if (shouldAttemptServiceLedger()) {
      const { error } = await supabase
        .schema("billing")
        .from("transactions")
        .insert(payload);

      if (!error) {
        markServiceLedgerAvailable();
        return;
      }

      if (
        isTransactionHistorySchemaMismatch(error) ||
        isTransactionTypeConstraintMismatch(error)
      ) {
        markServiceLedgerLegacy();
      } else {
        throw new Error(`Failed to save transaction: ${error.message}`);
      }
    }

    if (needsServiceLedger && !LEGACY_TRANSACTION_TYPES.has(requestedType)) {
      warnServiceLedgerUnavailable(`transaction type "${requestedType}"`);
      return;
    }

    if (!LEGACY_TRANSACTION_TYPES.has(requestedType)) {
      throw new Error(`Unsupported transaction type: ${requestedType}`);
    }

    const { error: legacyError } = await supabase
      .schema("billing")
      .from("transactions")
      .insert(legacyPayload);

    if (!legacyError) return;

    if (isTransactionTypeConstraintMismatch(legacyError) && needsServiceLedger) {
      warnServiceLedgerUnavailable(`transaction type "${requestedType}"`, legacyError);
      return;
    }

    throw new Error(`Failed to save transaction: ${legacyError.message}`);
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

  // --- Atomic Stripe webhook idempotency (C5) ---------------------------------
  // The webhook MUST claim a session/invoice BEFORE crediting the balance, or a
  // concurrent / retried Stripe delivery double-credits real money (Billing.topup
  // is an unconditional atomic increment with no idempotency of its own). We use
  // the partial UNIQUE index on stripe_session_id / stripe_invoice_id as the lock:
  // exactly one caller's INSERT of a 'pending' row succeeds; every other concurrent
  // caller gets a 23505 unique-violation and must NOT credit. The winner then
  // credits and flips the row to 'completed'. On failure the winner deletes its own
  // 'pending' claim so a later Stripe retry can re-claim and credit (a 'completed'
  // row is never touched, so a successful top-up is never repeated).
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
    const { error } = await supabase
      .schema("billing")
      .from("transactions")
      .insert({
        user_id: params.userId,
        stripe_session_id: params.stripeSessionId,
        stripe_payment_intent: params.stripePaymentIntent ?? null,
        amount: params.amount,
        currency: params.currency ?? "usd",
        status: "pending",
        type: params.type ?? "topup",
        description: params.description ?? null,
      });
    if (!error) return true;
    if (error.code === "23505") return false; // already claimed by a concurrent/prior delivery
    throw new Error(`Failed to claim session transaction: ${error.message}`);
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
    const { error } = await supabase
      .schema("billing")
      .from("transactions")
      .insert({
        user_id: params.userId,
        stripe_invoice_id: params.stripeInvoiceId,
        stripe_payment_intent: params.stripePaymentIntent ?? null,
        amount: params.amount,
        currency: params.currency ?? "usd",
        status: "pending",
        type: params.type ?? "recurring",
        description: params.description ?? null,
      });
    if (!error) return true;
    if (error.code === "23505") return false;
    throw new Error(`Failed to claim invoice transaction: ${error.message}`);
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
        status: "completed",
        stripe_payment_intent: params.stripePaymentIntent ?? null,
        amount: params.amount,
        currency: params.currency ?? "usd",
        type: params.type ?? "topup",
        balance_after: params.balanceAfter ?? null,
        description: params.description ?? null,
        receipt_url: params.receiptUrl ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("stripe_session_id", params.stripeSessionId)
      .neq("status", "completed");
    if (error) throw new Error(`Failed to complete session transaction: ${error.message}`);
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
        status: "completed",
        stripe_payment_intent: params.stripePaymentIntent ?? null,
        amount: params.amount,
        currency: params.currency ?? "usd",
        type: params.type ?? "recurring",
        balance_after: params.balanceAfter ?? null,
        description: params.description ?? null,
        receipt_url: params.receiptUrl ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("stripe_invoice_id", params.stripeInvoiceId)
      .neq("status", "completed");
    if (error) throw new Error(`Failed to complete invoice transaction: ${error.message}`);
  },

  mark_session_transaction_failed: async (stripeSessionId: string, _description?: string): Promise<void> => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("transactions")
      .delete()
      .eq("stripe_session_id", stripeSessionId)
      .eq("status", "pending");
    if (error) console.warn(`[Billing] Failed to clear pending session claim ${stripeSessionId}: ${error.message}`);
  },

  mark_invoice_transaction_failed: async (stripeInvoiceId: string, _description?: string): Promise<void> => {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .schema("billing")
      .from("transactions")
      .delete()
      .eq("stripe_invoice_id", stripeInvoiceId)
      .eq("status", "pending");
    if (error) console.warn(`[Billing] Failed to clear pending invoice claim ${stripeInvoiceId}: ${error.message}`);
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
      serviceType?: string;
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
      service_id: string | null;
      service_type: string | null;
      period_start: string | null;
      period_end: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
    }>;
    total: number;
  }> => {
    const supabase = await createServiceClient();
    const limit = opts?.limit ?? 20;
    const offset = opts?.offset ?? 0;

    const applyFilters = <
      T extends {
        eq: (column: string, value: unknown) => T;
        gte: (column: string, value: unknown) => T;
        lte: (column: string, value: unknown) => T;
      }
    >(
      query: T
    ): T => {
      let nextQuery = query.eq("user_id", userId);

      if (opts?.status && ["pending", "completed", "failed"].includes(opts.status)) {
        nextQuery = nextQuery.eq("status", opts.status);
      }
      if (
        opts?.type &&
        ["topup", "refund", "coupon", "recurring", "setup", "usage", "purchase"].includes(opts.type)
      ) {
        nextQuery = nextQuery.eq("type", opts.type);
      }
      if (
        opts?.serviceType &&
        // gpu_pod_storage and gpu_volume are v2 service types that bill today —
        // a pod opens TWO meters (compute + local disk) and a network volume a
        // third. They were missing here, and an unknown value is silently
        // DROPPED rather than rejected, so filtering by them returned the
        // unfiltered list. Keep in step with ServiceTypeFilter in BillingTabs.
        ["kubernetes", "database", "objectspace", "spectrum", "platform_apps", "domain", "compute", "gpu_pod", "gpu_pod_storage", "gpu_volume", "custom_image", "inference_finetune", "inference_serving", "inference_deployment", "inference_vector"].includes(opts.serviceType)
      ) {
        nextQuery = nextQuery.eq("service_type", opts.serviceType);
      }
      if (opts?.from) {
        nextQuery = nextQuery.gte("created_at", opts.from);
      }
      if (opts?.to) {
        nextQuery = nextQuery.lte("created_at", opts.to);
      }

      return nextQuery;
    };

    if (shouldAttemptServiceLedger()) {
      // account_ledger, NOT transactions.
      //
      // billing.transactions holds only money the customer MOVED — top-ups,
      // refunds, coupons. It has never held metered usage: charge_service_hour
      // writes billing.service_charges and deducts the balance directly. On
      // 2026-09-01 that meant 65 ledger rows, all type='topup', against 86 real
      // hourly charges — a customer could watch their balance fall with nothing
      // in their history explaining why.
      //
      // The view unions both and rolls usage up per service per day. See
      // 20260901120000_billing_v2_account_ledger_view.sql for why it is derived
      // rather than written.
      let ledgerQuery = supabase
        .schema("billing")
        .from("account_ledger")
        .select(
          "id, stripe_session_id, stripe_invoice_id, amount, currency, status, type, balance_after, description, receipt_url, service_id, service_type, period_start, period_end, metadata, created_at",
          { count: "exact" }
        );

      ledgerQuery = applyFilters(ledgerQuery);

      const { data, count, error } = await ledgerQuery
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (!error) {
        markServiceLedgerAvailable();
        return { transactions: data ?? [], total: count ?? 0 };
      }

      if (isTransactionHistorySchemaMismatch(error)) {
        markServiceLedgerLegacy();
      } else {
        throw new Error(`Failed to fetch transactions: ${error.message}`);
      }
    }

    let legacyQuery = supabase
      .schema("billing")
      .from("transactions")
      .select(
        "id, stripe_session_id, stripe_invoice_id, amount, currency, status, type, balance_after, description, receipt_url, created_at",
        { count: "exact" }
      );

    legacyQuery = applyFilters(legacyQuery);

    const { data, count, error } = await legacyQuery
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to fetch transactions: ${error.message}`);
    }

    const transactions = (data ?? []).map((row) => ({
      ...row,
      service_id: null,
      service_type: null,
      period_start: null,
      period_end: null,
      metadata: null,
      created_at: row.created_at ?? new Date(0).toISOString(),
    }));

    return { transactions, total: count ?? 0 };
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

