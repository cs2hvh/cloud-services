import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Validate required environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("FATAL: Missing required environment variables");
  console.error("Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// -----------------------------
// 1. SUPABASE CLIENT
// -----------------------------
const supabase =
  globalThis.__CRON_TEST_SUPABASE__ ||
  createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // must be service role
  );

// -----------------------------
// 2. SECURITY CONSTANTS
// -----------------------------
export const SECURITY_LIMITS = {
  MAX_HOURLY_RATE: 1000, // Maximum $1000/hour to prevent malicious rates
  MAX_HOURS_PER_BILLING: 24, // Maximum 24 hours between billings
  MIN_HOURLY_RATE: 0.0001, // Minimum rate (effectively free tier)
  MAX_COST_PER_CYCLE: 5000, // Maximum $5000 per billing cycle
  MIN_BILLABLE_COST: 0.001, // Minimum $0.001 to bill (prevent dust transactions)
};

// UUID validation regex (RFC 4122)
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Whitelist of valid table names to prevent SQL injection
export const VALID_TABLE_NAMES = [
  "active_kubernetes",
  "active_database",
  "active_objectspace",
  "active_spectrum",
  "active_platform_apps",
];

const TABLE_TO_SERVICE_TYPE = {
  active_kubernetes: "kubernetes",
  active_database: "database",
  active_objectspace: "objectspace",
  active_spectrum: "spectrum",
  active_platform_apps: "platform_apps",
};

let transactionHistoryMode = "unknown";
let hasWarnedServiceLedgerUnavailable = false;
let lastServiceLedgerMismatchAt = 0;
const SERVICE_LEDGER_REPROBE_INTERVAL_MS = 60_000;

function roundToCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseBillingTimestamp(value) {
  if (!value) return null;

  const parsed =
    typeof value === "string"
      ? new Date(
          value.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(value)
            ? value
            : `${value}Z`
        )
      : new Date(value);

  if (isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientSupabaseError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "40001" || // serialization_failure
    code === "40P01" || // deadlock_detected
    code === "55P03" || // lock_not_available
    code === "57014" || // statement_timeout
    code === "08006" || // connection_failure
    code === "08001" || // sqlclient_unable_to_establish_sqlconnection
    message.includes("timeout") ||
    message.includes("temporarily") ||
    message.includes("connection") ||
    message.includes("network")
  );
}

function isTransactionHistorySchemaMismatch(error) {
  if (!error || typeof error !== "object") return false;
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  const mentionsNewColumn =
    message.includes("service_id") ||
    message.includes("service_type") ||
    message.includes("period_start") ||
    message.includes("period_end") ||
    message.includes("metadata");

  return Boolean(
    mentionsNewColumn &&
      (error.code === "PGRST204" ||
        error.code === "42703" ||
        message.includes("could not find the") ||
        message.includes("column"))
  );
}

function isTransactionTypeConstraintMismatch(error) {
  if (!error || typeof error !== "object") return false;
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  return (
    error.code === "23514" ||
    message.includes("transactions_type_check") ||
    (message.includes("check constraint") && message.includes("type"))
  );
}

function warnServiceLedgerUnavailable(error) {
  if (hasWarnedServiceLedgerUnavailable) return;
  hasWarnedServiceLedgerUnavailable = true;
  console.warn(
    "⚠️ Service usage transaction history is unavailable until the billing.transactions ledger migration is applied.",
    error?.message || ""
  );
}

function shouldAttemptServiceLedger() {
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

async function getBalanceAfterDeduction(userId) {
  const { data, error } = await supabase
    .schema("billing")
    .from("user_credits")
    .select("credit_balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn(`⚠️ Failed to fetch balance after deduction for ${userId}: ${error.message}`);
    return null;
  }

  if (typeof data?.credit_balance === "number") {
    return data.credit_balance;
  }

  if (data?.credit_balance != null) {
    const parsed = Number(data.credit_balance);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

async function recordUsageTransaction({
  userId,
  serviceId,
  serviceType,
  amount,
  balanceAfter,
  periodStart,
  periodEnd,
  hourlyRate,
  hoursUsed,
  tableName,
}) {
  if (!shouldAttemptServiceLedger()) {
    return;
  }

  const { error } = await supabase
    .schema("billing")
    .from("transactions")
    .insert({
      user_id: userId,
      amount,
      currency: "usd",
      status: "completed",
      type: "usage",
      balance_after: balanceAfter,
      description: `${serviceType.replace("_", " ")} usage charge`,
      service_id: serviceId,
      service_type: serviceType,
      period_start: periodStart,
      period_end: periodEnd,
      metadata: {
        source: "credit-system-cron",
        table: tableName,
        hourly_rate: rateToMetadata(hourlyRate),
        hours_used: Number(hoursUsed.toFixed(6)),
      },
      completed_at: periodEnd,
    });

  if (!error) {
    markServiceLedgerAvailable();
    return;
  }

  if (isTransactionHistorySchemaMismatch(error) || isTransactionTypeConstraintMismatch(error)) {
    markServiceLedgerLegacy();
    warnServiceLedgerUnavailable(error);
    return;
  }

  console.warn(
    `⚠️ Failed to record usage transaction for ${serviceId}: ${error.message}`
  );
}

function rateToMetadata(value) {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function runAtomicBillingCycle(params) {
  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { data, error } = await supabase
      .schema("billing")
      .rpc("bill_service_cycle_atomic", params);

    if (!error) {
      return { data, error: null };
    }

    lastError = error;
    if (!isTransientSupabaseError(error) || attempt === 2) {
      break;
    }

    await sleep(200);
  }

  return { data: null, error: lastError };
}

async function recordBillingFailure({
  tableName,
  serviceId,
  userId,
  amount,
  failureType,
  errorCode = null,
  errorMessage = null,
  occurredAt,
  lastBilledAt = null,
}) {
  try {
    await supabase
      .schema("billing")
      .from("billing_failure_events")
      .insert({
        service_table: tableName,
        service_id: serviceId,
        user_id: userId,
        amount,
        failure_type: failureType,
        error_code: errorCode,
        error_message: errorMessage,
        occurred_at: occurredAt,
        billing_attempted_at: occurredAt,
        last_billed_at: lastBilledAt,
      });
  } catch (error) {
    console.error("WARN: Failed to record billing failure event", {
      tableName,
      serviceId,
      userId,
      failureType,
      error: error?.message || String(error),
    });
  }
}

async function resolveBillingFailures(tableName, serviceId, userId) {
  try {
    await supabase
      .schema("billing")
      .from("billing_failure_events")
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
      })
      .eq("service_table", tableName)
      .eq("service_id", serviceId)
      .eq("user_id", userId)
      .eq("resolved", false);
  } catch {
    // Best effort only. Failure tracking should never break billing flow.
  }
}

export async function billSingleService(tableName, svc) {
  // Validate table name to prevent SQL injection
  if (!VALID_TABLE_NAMES.includes(tableName)) {
    console.error(`SECURITY: Invalid table name attempted: ${tableName}`);
    return;
  }

  const { service_id, user_id, hourly_rate, last_billed_at, created_at } = svc;

  // Validate required fields exist
  if (!service_id || !user_id || hourly_rate === undefined) {
    console.error("SECURITY: Missing required fields in service record", {
      tableName,
      service_id,
      user_id,
      has_hourly_rate: hourly_rate !== undefined,
    });
    return;
  }

  // Validate UUIDs to prevent malformed IDs
  if (!UUID_REGEX.test(service_id)) {
    console.error(
      `SECURITY: Invalid service_id format (not a valid UUID): ${service_id}`
    );
    return;
  }

  if (!UUID_REGEX.test(user_id)) {
    console.error(
      `SECURITY: Invalid user_id format (not a valid UUID): ${user_id}`
    );
    return;
  }

  const now = new Date();

  const last = parseBillingTimestamp(last_billed_at);
  if (last_billed_at && !last) {
    console.error(
      `SECURITY: Invalid last_billed_at date for service ${service_id}: ${last_billed_at}`
    );
    return;
  }

  let hoursUsed;
  if (last) {
    hoursUsed = (now - last) / (1000 * 60 * 60);
  } else if (created_at) {
    const createdDate = parseBillingTimestamp(created_at);
    // Validate created_at is not in the future or too far in the past
    if (
      !createdDate ||
      createdDate > now ||
      createdDate < new Date("2020-01-01")
    ) {
      console.error(
        `SECURITY: Invalid created_at date for service ${service_id}: ${created_at}`
      );
      return;
    }
    hoursUsed = (now - createdDate) / (1000 * 60 * 60);
  } else {
    // No last_billed_at or created_at, use safe default
    hoursUsed = 1;
  }

  // Security limit: Cap hours to prevent billing for corrupted timestamps
  if (hoursUsed > SECURITY_LIMITS.MAX_HOURS_PER_BILLING) {
    console.warn(
      `SECURITY: Hours exceeded maximum (${hoursUsed.toFixed(2)} > ${
        SECURITY_LIMITS.MAX_HOURS_PER_BILLING
      }) for service ${service_id}, capping to max`
    );
    hoursUsed = SECURITY_LIMITS.MAX_HOURS_PER_BILLING;
  }

  // Prevent negative hours from clock skew or bad data
  if (hoursUsed < 0) {
    console.error(
      `SECURITY: Negative hours calculated for service ${service_id}, skipping`
    );
    return;
  }

  // Parse and validate hourly rate with strict type checking
  let rate;
  if (typeof hourly_rate === "number") {
    rate = hourly_rate;
  } else if (typeof hourly_rate === "string") {
    rate = parseFloat(hourly_rate);
    // Ensure the entire string was a valid number (parseFloat("123abc") = 123 is bad)
    if (
      hourly_rate.trim() !== rate.toString() &&
      hourly_rate.trim() !== String(Number(hourly_rate))
    ) {
      console.error(
        `SECURITY: Malformed hourly_rate string for ${tableName} service_id=${service_id}: "${hourly_rate}"`
      );
      return;
    }
  } else {
    console.error(
      `SECURITY: Invalid hourly_rate type for ${tableName} service_id=${service_id}: ${typeof hourly_rate}`
    );
    return;
  }

  // Validate rate bounds
  if (isNaN(rate) || !isFinite(rate)) {
    console.error(
      `SECURITY: Non-numeric hourly_rate for ${tableName} service_id=${service_id}: ${hourly_rate}`
    );
    return;
  }

  if (rate < SECURITY_LIMITS.MIN_HOURLY_RATE) {
    console.error(
      `SECURITY: Rate below minimum (${rate} < ${SECURITY_LIMITS.MIN_HOURLY_RATE}) for service ${service_id}`
    );
    return;
  }

  if (rate > SECURITY_LIMITS.MAX_HOURLY_RATE) {
    console.error(
      `SECURITY: Rate exceeds maximum (${rate} > ${SECURITY_LIMITS.MAX_HOURLY_RATE}) for service ${service_id}, capping to max`
    );
    rate = SECURITY_LIMITS.MAX_HOURLY_RATE;
  }

  // Calculate cost and round to 2 decimals for currency-safe deduction
  const rawCost = hoursUsed * rate;
  const cost = roundToCurrency(rawCost);

  // Security: Skip billing if cost is below minimum threshold (prevents dust transactions)
  if (cost < SECURITY_LIMITS.MIN_BILLABLE_COST) {
    console.log(
      `INFO: Skipping billing for ${tableName} service_id=${service_id}: cost $${cost.toFixed(2)} below minimum $${SECURITY_LIMITS.MIN_BILLABLE_COST}`
    );
    return;
  }

  // Security: Cap cost per billing cycle
  const finalCost = roundToCurrency(
    Math.min(cost, SECURITY_LIMITS.MAX_COST_PER_CYCLE)
  );
  if (cost > SECURITY_LIMITS.MAX_COST_PER_CYCLE) {
    console.warn(
      `SECURITY: Cost $${cost.toFixed(2)} exceeds maximum $${SECURITY_LIMITS.MAX_COST_PER_CYCLE} for service ${service_id}, capping`
    );
  }

  console.log(
    `BILLING ${tableName} -> service_id=${service_id}, user_id=${user_id}, hours=${hoursUsed.toFixed(
      4
    )}, rate=${rate}, cost=$${finalCost.toFixed(2)}`
  );

  const periodStart = last
    ? last.toISOString()
    : parseBillingTimestamp(created_at)?.toISOString() || null;
  const periodEnd = now.toISOString();
  const billedAtIso = periodEnd;
  const expectedLastBilledAtIso = last ? last.toISOString() : null;

  const { data: cycleResult, error: cycleError } = await runAtomicBillingCycle({
    p_table_name: tableName,
    p_service_id: service_id,
    p_user_id: user_id,
    p_amount: finalCost,
    p_new_last_billed_at: billedAtIso,
    p_expected_last_billed_at: expectedLastBilledAtIso,
  });

  if (cycleError) {
    await recordBillingFailure({
      tableName,
      serviceId: service_id,
      userId: user_id,
      amount: finalCost,
      failureType: "rpc_error",
      errorCode: cycleError.code || null,
      errorMessage: cycleError.message || "Unknown error",
      occurredAt: billedAtIso,
      lastBilledAt: expectedLastBilledAtIso,
    });

    console.error(`CRITICAL: Atomic billing cycle failed for ${tableName}`, {
      service_id,
      user_id,
      cost: finalCost,
      error: cycleError.message || "Unknown error",
      error_code: cycleError.code,
      timestamp: billedAtIso,
      note: "Billing was not finalized due to RPC failure",
    });
    return;
  }

  const charged = cycleResult?.charged === true;
  const status = typeof cycleResult?.status === "string" ? cycleResult.status : "unknown";

  if (!charged) {
    // Concurrent worker already billed this row based on newer timestamp.
    if (status === "stale_last_billed_at") {
      console.log(
        `INFO: Skipping ${tableName} service_id=${service_id}: already handled by another worker`
      );
      return;
    }

    await recordBillingFailure({
      tableName,
      serviceId: service_id,
      userId: user_id,
      amount: finalCost,
      failureType: status,
      errorMessage: `Atomic cycle status: ${status}`,
      occurredAt: billedAtIso,
      lastBilledAt: expectedLastBilledAtIso,
    });

    console.error(`CRITICAL: Atomic billing cycle not charged for ${tableName}`, {
      service_id,
      user_id,
      cost: finalCost,
      status,
      timestamp: billedAtIso,
      note: "Timestamp may be advanced without deduction for this period",
    });
    return;
  }

  await resolveBillingFailures(tableName, service_id, user_id);

  const balanceAfter =
    transactionHistoryMode === "legacy"
      ? null
      : await getBalanceAfterDeduction(user_id);
  await recordUsageTransaction({
    userId: user_id,
    serviceId: service_id,
    serviceType: TABLE_TO_SERVICE_TYPE[tableName],
    amount: finalCost,
    balanceAfter,
    periodStart,
    periodEnd,
    hourlyRate: rate,
    hoursUsed,
    tableName,
  });

  console.log(
    `SUCCESS: Billed ${tableName} service_id=${service_id}, cost=$${finalCost.toFixed(
      2
    )}`
  );
}

export async function processServiceTable(tableName) {
  try {
    console.log(
      `Loading active services from billing schema table ${tableName}...`
    );

    const { data: services, error } = await supabase
      .schema("billing")
      .from(tableName)
      .select("*")
      .eq("status", "active");

    if (error) {
      console.error(`Error fetching ${tableName}:`, {
        message: error.message || "Unknown error",
        code: error.code,
      });
      return;
    }

    if (!services || services.length === 0) {
      console.log(`No active services in ${tableName}`);
      return;
    }

    console.log(
      `Processing ${services.length} active services from ${tableName}`
    );

    for (const svc of services) {
      try {
        await billSingleService(tableName, svc);
      } catch (error) {
        console.error(`CRITICAL: Failed to bill service in ${tableName}:`, {
          service_id: svc.service_id,
          error: error.message,
          stack: error.stack,
        });
        // Continue processing other services even if one fails
      }
    }
  } catch (error) {
    console.error(`CRITICAL: processServiceTable failed for ${tableName}:`, {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    throw error; // Re-throw to be caught by Promise.allSettled
  }
}

// Run every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  try {
    console.log("Billing cycle started:", new Date().toISOString());

    const results = await Promise.allSettled([
      processServiceTable("active_kubernetes"),
      processServiceTable("active_database"),
      processServiceTable("active_objectspace"),
      processServiceTable("active_spectrum"),
      processServiceTable("active_platform_apps"),
    ]);

    // Log any table processing failures
    results.forEach((result, index) => {
      const tables = [
        "active_kubernetes",
        "active_database",
        "active_objectspace",
        "active_spectrum",
        "active_platform_apps",
      ];
      if (result.status === "rejected") {
        console.error(
          `CRITICAL: Failed to process table ${tables[index]}:`,
          result.reason
        );
      }
    });

    console.log("Billing cycle completed:", new Date().toISOString());
  } catch (error) {
    console.error("CRITICAL: Billing cycle crashed:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    // Don't throw - let cron continue to next cycle
  }
});

console.log("🚀 Cron worker started successfully");
console.log("📅 Schedule: Every 5 minutes (*/5 * * * *)");
console.log("🔧 Supabase connected:", process.env.SUPABASE_URL ? "✓" : "✗");

// -----------------------------
// DOMAIN REGISTRANT CONTACT SYNC
// Runs every hour — retries setRegistrantContact for purchases where the
// initial async call failed (registrant_email IS NULL). Prevents ICANN holds
// from hitting users because the verification email never reached them.
// -----------------------------
cron.schedule("0 * * * *", async () => {
  const appUrl = process.env.DOMAIN;
  const cronSecret = process.env.CRON_SECRET;

  if (!appUrl || !cronSecret) {
    console.warn("[domain-contact-sync] Skipped: DOMAIN or CRON_SECRET not set");
    return;
  }

  try {
    console.log("[domain-contact-sync] Running reconciliation:", new Date().toISOString());
    const res = await fetch(`${appUrl}/api/domains/market/sync-contacts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ limit: 20 }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("[domain-contact-sync] Reconciliation failed:", data);
    } else {
      console.log("[domain-contact-sync] Reconciliation completed:", data.message);
    }
  } catch (error) {
    console.error("[domain-contact-sync] Reconciliation error:", error.message);
  }
});
console.log(
  "Security limits: Max rate=$" +
    SECURITY_LIMITS.MAX_HOURLY_RATE +
    "/hr, Max hours=" +
    SECURITY_LIMITS.MAX_HOURS_PER_BILLING +
    "h, Max cost/cycle=$" +
    SECURITY_LIMITS.MAX_COST_PER_CYCLE +
    ", Min billable=$" +
    SECURITY_LIMITS.MIN_BILLABLE_COST
);
console.log("⏰ Next run:", new Date(Date.now() + 5 * 60 * 1000).toISOString());
