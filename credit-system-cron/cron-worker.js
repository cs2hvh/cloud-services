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

const BILLING_SERVICE_TABLES = Object.keys(TABLE_TO_SERVICE_TYPE);

const GRACE_LIFECYCLE_STATES = {
  GRACE: "grace",
  DELETION_SCHEDULED: "deletion_scheduled",
  DELETING: "deleting",
  DELETED: "deleted",
  RESTORED: "restored",
};

function parsePositiveNumberEnv(name, fallback) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseReminderOffsetsEnv() {
  const raw = process.env.BILLING_REMINDER_OFFSETS_DAYS ?? "3,1";
  const values = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a);

  if (values.length === 0) return [3, 1];
  return [...new Set(values)];
}

const GRACE_CONFIG = {
  ENABLED: (process.env.BILLING_GRACE_AUTODELETE_ENABLED ?? "true").toLowerCase() !== "false",
  PERIOD_DAYS: parsePositiveNumberEnv("BILLING_GRACE_PERIOD_DAYS", 0.006944444),
  FINAL_WARNING_HOURS: parsePositiveNumberEnv("BILLING_FINAL_WARNING_HOURS",0.1),
  REMINDER_OFFSETS_DAYS: parseReminderOffsetsEnv(),
  DELETE_MAX_RETRIES: Math.max(1, Math.floor(parsePositiveNumberEnv("BILLING_DELETE_MAX_RETRIES", 5))),
  DELETE_RETRY_BACKOFF_SECONDS: parsePositiveNumberEnv("BILLING_DELETE_RETRY_BACKOFF_SECONDS", 15),
  RECOVERY_MIN_HOURS_COVERAGE: parsePositiveNumberEnv("BILLING_RECOVERY_MIN_HOURS_COVERAGE", 1),
};

let transactionHistoryMode = "unknown";
let hasWarnedServiceLedgerUnavailable = false;
let lastServiceLedgerMismatchAt = 0;
const SERVICE_LEDGER_REPROBE_INTERVAL_MS = 60_000;
let hasWarnedGraceSchemaUnavailable = false;
let hasWarnedGraceRouteConfiguration = false;

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

function asObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}

function formatGraceNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isGraceSchemaUnavailable(error) {
  if (!error || typeof error !== "object") return false;

  const code = String(error.code || "");
  const message = String(error.message || "").toLowerCase();
  const mentionsGraceTables =
    message.includes("service_lifecycle") || message.includes("notification_outbox");

  return (
    code === "42P01" || // undefined_table
    code === "42703" || // undefined_column
    code === "PGRST204" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    mentionsGraceTables
  );
}

function warnGraceSchemaUnavailable(error) {
  if (hasWarnedGraceSchemaUnavailable) return;
  hasWarnedGraceSchemaUnavailable = true;
  console.warn(
    "⚠️ Grace lifecycle schema is unavailable. Apply billing grace migrations to enable auto-delete flow.",
    error?.message || ""
  );
}

function getAppDomainBaseUrl() {
  const raw = String(process.env.DOMAIN || "").trim();
  if (!raw) return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

async function postInternalCronRoute(path, payload) {
  const appUrl = getAppDomainBaseUrl();
  const cronSecret = process.env.CRON_SECRET;

  if (!appUrl || !cronSecret) {
    if (!hasWarnedGraceRouteConfiguration) {
      hasWarnedGraceRouteConfiguration = true;
      console.warn(
        "⚠️ Grace internal routes are disabled because DOMAIN or CRON_SECRET is not configured."
      );
    }
    return {
      ok: false,
      skipped: true,
      status: 0,
      data: null,
      errorMessage: "Missing DOMAIN or CRON_SECRET",
    };
  }

  try {
    const response = await fetch(`${appUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify(payload ?? {}),
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        status: response.status,
        data: body,
        errorMessage:
          (body && typeof body.message === "string" && body.message) ||
          `HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      skipped: false,
      status: response.status,
      data: body,
      errorMessage: null,
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      status: 0,
      data: null,
      errorMessage: error?.message || "Unknown request failure",
    };
  }
}

async function enqueueGraceOutboxEvent({
  eventKey,
  eventType,
  userId,
  serviceTable,
  serviceId,
  payload,
}) {
  try {
    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .schema("billing")
      .from("notification_outbox")
      .upsert(
        {
          event_key: eventKey,
          event_type: eventType,
          user_id: userId,
          service_table: serviceTable || null,
          service_id: serviceId || null,
          payload: payload || {},
          status: "pending",
          updated_at: nowIso,
        },
        { onConflict: "event_key" }
      );

    if (error) {
      if (isGraceSchemaUnavailable(error)) {
        warnGraceSchemaUnavailable(error);
        return false;
      }
      console.warn(`⚠️ Failed to enqueue grace outbox event ${eventKey}: ${error.message}`);
      return false;
    }

    return true;
  } catch (error) {
    if (isGraceSchemaUnavailable(error)) {
      warnGraceSchemaUnavailable(error);
      return false;
    }
    console.warn(
      `⚠️ Failed to enqueue grace outbox event ${eventKey}: ${error?.message || "Unknown error"}`
    );
    return false;
  }
}

function mapReminderOffsetToEventType(daysOffset) {
  const rounded = Math.round(daysOffset);
  if (rounded === 3) return "grace_reminder_day3";
  if (rounded === 1) return "grace_reminder_day1";
  return `grace_reminder_day${rounded}`;
}

async function startGraceLifecycleForInsufficientCredit({
  tableName,
  serviceId,
  userId,
  hourlyRate,
  attemptedAmount,
  availableBalance,
  occurredAtIso,
}) {
  if (!GRACE_CONFIG.ENABLED) return;

  const now = parseBillingTimestamp(occurredAtIso) || new Date();
  const nowIso = now.toISOString();
  const graceExpiresAtIso = new Date(
    now.getTime() + GRACE_CONFIG.PERIOD_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const requiredBalance = roundToCurrency(
    Math.max(hourlyRate * GRACE_CONFIG.RECOVERY_MIN_HOURS_COVERAGE, 0)
  );

  let lifecycleRow = null;

  try {
    const { data: existing, error: readError } = await supabase
      .schema("billing")
      .from("service_lifecycle")
      .select(
        "id, state, user_id, service_table, service_id, grace_started_at, grace_expires_at, metadata"
      )
      .eq("service_table", tableName)
      .eq("service_id", serviceId)
      .maybeSingle();

    if (readError) {
      if (isGraceSchemaUnavailable(readError)) {
        warnGraceSchemaUnavailable(readError);
        return;
      }
      console.error(
        `CRITICAL: Failed to read grace lifecycle for ${tableName}:${serviceId}: ${readError.message}`
      );
      return;
    }

    if (existing) {
      if (
        existing.state === GRACE_LIFECYCLE_STATES.GRACE ||
        existing.state === GRACE_LIFECYCLE_STATES.DELETION_SCHEDULED ||
        existing.state === GRACE_LIFECYCLE_STATES.DELETING ||
        existing.state === GRACE_LIFECYCLE_STATES.DELETED
      ) {
        return;
      }

      const mergedMetadata = {
        ...asObject(existing.metadata),
        reason: "insufficient_credit",
        required_balance: requiredBalance,
        recovery_min_hours_coverage: GRACE_CONFIG.RECOVERY_MIN_HOURS_COVERAGE,
        insufficient_credit_detected_at: nowIso,
        available_balance:
          formatGraceNumber(availableBalance) !== null
            ? formatGraceNumber(availableBalance)
            : null,
        billing_attempt_amount: attemptedAmount,
        hourly_rate: formatGraceNumber(hourlyRate),
        previous_state: existing.state,
      };

      const { data: updatedRow, error: updateError } = await supabase
        .schema("billing")
        .from("service_lifecycle")
        .update({
          user_id: userId,
          state: GRACE_LIFECYCLE_STATES.GRACE,
          grace_started_at: nowIso,
          grace_expires_at: graceExpiresAtIso,
          deletion_started_at: null,
          deleted_at: null,
          deletion_attempts: 0,
          last_error: null,
          metadata: mergedMetadata,
          updated_at: nowIso,
        })
        .eq("id", existing.id)
        .select("id, grace_expires_at")
        .maybeSingle();

      if (updateError) {
        if (isGraceSchemaUnavailable(updateError)) {
          warnGraceSchemaUnavailable(updateError);
          return;
        }
        console.error(
          `CRITICAL: Failed to update grace lifecycle for ${tableName}:${serviceId}: ${updateError.message}`
        );
        return;
      }

      lifecycleRow = updatedRow;
    } else {
      const insertedMetadata = {
        reason: "insufficient_credit",
        required_balance: requiredBalance,
        recovery_min_hours_coverage: GRACE_CONFIG.RECOVERY_MIN_HOURS_COVERAGE,
        insufficient_credit_detected_at: nowIso,
        available_balance:
          formatGraceNumber(availableBalance) !== null
            ? formatGraceNumber(availableBalance)
            : null,
        billing_attempt_amount: attemptedAmount,
        hourly_rate: formatGraceNumber(hourlyRate),
      };

      const { data: insertedRow, error: insertError } = await supabase
        .schema("billing")
        .from("service_lifecycle")
        .insert({
          service_table: tableName,
          service_id: serviceId,
          user_id: userId,
          state: GRACE_LIFECYCLE_STATES.GRACE,
          grace_started_at: nowIso,
          grace_expires_at: graceExpiresAtIso,
          deletion_attempts: 0,
          metadata: insertedMetadata,
          updated_at: nowIso,
        })
        .select("id, grace_expires_at")
        .maybeSingle();

      if (insertError) {
        if (insertError.code === "23505") {
          return;
        }
        if (isGraceSchemaUnavailable(insertError)) {
          warnGraceSchemaUnavailable(insertError);
          return;
        }
        console.error(
          `CRITICAL: Failed to create grace lifecycle for ${tableName}:${serviceId}: ${insertError.message}`
        );
        return;
      }

      lifecycleRow = insertedRow;
    }
  } catch (error) {
    if (isGraceSchemaUnavailable(error)) {
      warnGraceSchemaUnavailable(error);
      return;
    }
    console.error(
      `CRITICAL: Grace lifecycle handling failed for ${tableName}:${serviceId}:`,
      error?.message || String(error)
    );
    return;
  }

  const lifecycleId = lifecycleRow?.id ?? `${tableName}:${serviceId}`;
  await enqueueGraceOutboxEvent({
    eventKey: `grace_started:${lifecycleId}:${graceExpiresAtIso}`,
    eventType: "grace_started",
    userId,
    serviceTable: tableName,
    serviceId,
    payload: {
      grace_started_at: nowIso,
      grace_expires_at: lifecycleRow?.grace_expires_at || graceExpiresAtIso,
      required_balance: requiredBalance,
      available_balance:
        formatGraceNumber(availableBalance) !== null
          ? formatGraceNumber(availableBalance)
          : null,
      billing_attempt_amount: attemptedAmount,
      hourly_rate: formatGraceNumber(hourlyRate),
    },
  });
}

async function enqueueGraceReminderEvents() {
  if (!GRACE_CONFIG.ENABLED) return;

  const now = new Date();
  const nowIso = now.toISOString();

  let rows = null;
  try {
    const { data, error } = await supabase
      .schema("billing")
      .from("service_lifecycle")
      .select(
        "id, user_id, service_table, service_id, state, grace_started_at, grace_expires_at, metadata"
      )
      .eq("state", GRACE_LIFECYCLE_STATES.GRACE)
      .order("grace_expires_at", { ascending: true })
      .limit(500);

    if (error) {
      if (isGraceSchemaUnavailable(error)) {
        warnGraceSchemaUnavailable(error);
        return;
      }
      console.error(`CRITICAL: Failed to load grace lifecycle reminders: ${error.message}`);
      return;
    }

    rows = data || [];
  } catch (error) {
    if (isGraceSchemaUnavailable(error)) {
      warnGraceSchemaUnavailable(error);
      return;
    }
    console.error(
      "CRITICAL: Grace reminder lifecycle query failed:",
      error?.message || String(error)
    );
    return;
  }

  for (const row of rows) {
    const graceExpiresAt = parseBillingTimestamp(row.grace_expires_at);
    if (!graceExpiresAt) continue;

    const millisecondsRemaining = graceExpiresAt.getTime() - now.getTime();
    if (millisecondsRemaining <= 0) {
      continue;
    }

    const hoursRemaining = millisecondsRemaining / (1000 * 60 * 60);
    const metadata = asObject(row.metadata);
    const requiredBalance =
      formatGraceNumber(metadata.required_balance) !== null
        ? formatGraceNumber(metadata.required_balance)
        : null;

    for (const offsetDays of GRACE_CONFIG.REMINDER_OFFSETS_DAYS) {
      const thresholdHours = offsetDays * 24;
      if (hoursRemaining > thresholdHours) continue;

      const reminderEventType = mapReminderOffsetToEventType(offsetDays);
      await enqueueGraceOutboxEvent({
        eventKey: `${reminderEventType}:${row.id}:${row.grace_expires_at}`,
        eventType: reminderEventType,
        userId: row.user_id,
        serviceTable: row.service_table,
        serviceId: row.service_id,
        payload: {
          grace_expires_at: row.grace_expires_at,
          reminder_offset_days: offsetDays,
          required_balance: requiredBalance,
          hours_remaining: Number(hoursRemaining.toFixed(2)),
          generated_at: nowIso,
        },
      });
    }

    if (hoursRemaining <= GRACE_CONFIG.FINAL_WARNING_HOURS) {
      await enqueueGraceOutboxEvent({
        eventKey: `grace_reminder_6h:${row.id}:${row.grace_expires_at}`,
        eventType: "grace_reminder_6h",
        userId: row.user_id,
        serviceTable: row.service_table,
        serviceId: row.service_id,
        payload: {
          grace_expires_at: row.grace_expires_at,
          final_warning_hours: GRACE_CONFIG.FINAL_WARNING_HOURS,
          required_balance: requiredBalance,
          hours_remaining: Number(hoursRemaining.toFixed(2)),
          generated_at: nowIso,
        },
      });
    }
  }
}

async function executeGraceDeletionForExpiredServices() {
  if (!GRACE_CONFIG.ENABLED) return;

  const now = new Date();
  const nowIso = now.toISOString();
  const backoffMs = GRACE_CONFIG.DELETE_RETRY_BACKOFF_SECONDS * 1000;

  let rows = null;
  try {
    const { data, error } = await supabase
      .schema("billing")
      .from("service_lifecycle")
      .select(
        "id, user_id, service_table, service_id, state, grace_expires_at, deletion_attempts, deletion_started_at, metadata"
      )
      .in("state", [
        GRACE_LIFECYCLE_STATES.GRACE,
        GRACE_LIFECYCLE_STATES.DELETION_SCHEDULED,
      ])
      .lte("grace_expires_at", nowIso)
      .order("grace_expires_at", { ascending: true })
      .limit(200);

    if (error) {
      if (isGraceSchemaUnavailable(error)) {
        warnGraceSchemaUnavailable(error);
        return;
      }
      console.error(`CRITICAL: Failed to load expired grace rows: ${error.message}`);
      return;
    }
    rows = data || [];
  } catch (error) {
    if (isGraceSchemaUnavailable(error)) {
      warnGraceSchemaUnavailable(error);
      return;
    }
    console.error(
      "CRITICAL: Expired grace lifecycle query failed:",
      error?.message || String(error)
    );
    return;
  }

  for (const row of rows) {
    const attempts = Number(row.deletion_attempts || 0);
    if (attempts >= GRACE_CONFIG.DELETE_MAX_RETRIES) {
      continue;
    }

    const lastDeletionStart = parseBillingTimestamp(row.deletion_started_at);
    if (lastDeletionStart && now.getTime() - lastDeletionStart.getTime() < backoffMs) {
      continue;
    }

    if (row.state === GRACE_LIFECYCLE_STATES.GRACE) {
      const { data: scheduledRow, error: scheduleError } = await supabase
        .schema("billing")
        .from("service_lifecycle")
        .update({
          state: GRACE_LIFECYCLE_STATES.DELETION_SCHEDULED,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("state", GRACE_LIFECYCLE_STATES.GRACE)
        .select("id")
        .maybeSingle();

      if (scheduleError) {
        if (isGraceSchemaUnavailable(scheduleError)) {
          warnGraceSchemaUnavailable(scheduleError);
          return;
        }
        console.error(
          `CRITICAL: Failed to schedule grace deletion for ${row.service_table}:${row.service_id}: ${scheduleError.message}`
        );
        continue;
      }

      if (!scheduledRow) {
        continue;
      }
    }

    const attemptNumber = attempts + 1;
    const deletionStartedAtIso = new Date().toISOString();

    const { data: deletingRow, error: claimError } = await supabase
      .schema("billing")
      .from("service_lifecycle")
      .update({
        state: GRACE_LIFECYCLE_STATES.DELETING,
        deletion_started_at: deletionStartedAtIso,
        deletion_attempts: attemptNumber,
        last_error: null,
        updated_at: deletionStartedAtIso,
      })
      .eq("id", row.id)
      .eq("state", GRACE_LIFECYCLE_STATES.DELETION_SCHEDULED)
      .select("id, metadata")
      .maybeSingle();

    if (claimError) {
      if (isGraceSchemaUnavailable(claimError)) {
        warnGraceSchemaUnavailable(claimError);
        return;
      }
      console.error(
        `CRITICAL: Failed to claim deletion for ${row.service_table}:${row.service_id}: ${claimError.message}`
      );
      continue;
    }

    if (!deletingRow) {
      continue;
    }

    const deletionResponse = await postInternalCronRoute(
      "/api/internal/billing/grace-delete/execute",
      {
        service_table: row.service_table,
        service_id: row.service_id,
        user_id: row.user_id,
      }
    );

    if (deletionResponse.ok && deletionResponse.data?.success) {
      const deletedAtIso = new Date().toISOString();
      const mergedMetadata = {
        ...asObject(deletingRow.metadata),
        deleted_by: "billing_grace_auto_delete",
        deleted_at: deletedAtIso,
        delete_response: deletionResponse.data?.metadata || null,
      };

      const { error: markDeletedError } = await supabase
        .schema("billing")
        .from("service_lifecycle")
        .update({
          state: GRACE_LIFECYCLE_STATES.DELETED,
          deleted_at: deletedAtIso,
          last_error: null,
          metadata: mergedMetadata,
          updated_at: deletedAtIso,
        })
        .eq("id", row.id);

      if (markDeletedError) {
        if (isGraceSchemaUnavailable(markDeletedError)) {
          warnGraceSchemaUnavailable(markDeletedError);
          return;
        }
        console.error(
          `CRITICAL: Failed to mark deleted state for ${row.service_table}:${row.service_id}: ${markDeletedError.message}`
        );
        continue;
      }

      await enqueueGraceOutboxEvent({
        eventKey: `grace_deleted:${row.id}`,
        eventType: "grace_deleted",
        userId: row.user_id,
        serviceTable: row.service_table,
        serviceId: row.service_id,
        payload: {
          grace_expires_at: row.grace_expires_at,
          deleted_at: deletedAtIso,
          attempts: attemptNumber,
          result: deletionResponse.data?.message || "deleted",
        },
      });
      continue;
    }

    const errorMessage =
      deletionResponse.errorMessage ||
      (deletionResponse.data &&
        typeof deletionResponse.data.error === "string" &&
        deletionResponse.data.error) ||
      "Unknown deletion execution failure";
    const shouldRetry = attemptNumber < GRACE_CONFIG.DELETE_MAX_RETRIES;
    const failureIso = new Date().toISOString();
    const failureMetadata = {
      ...asObject(deletingRow.metadata),
      last_delete_failure_at: failureIso,
      last_delete_failure_status: deletionResponse.status || null,
      exhausted_retries: !shouldRetry,
    };

    const { error: retryError } = await supabase
      .schema("billing")
      .from("service_lifecycle")
      .update({
        state: GRACE_LIFECYCLE_STATES.DELETION_SCHEDULED,
        last_error: errorMessage,
        metadata: failureMetadata,
        updated_at: failureIso,
      })
      .eq("id", row.id)
      .eq("state", GRACE_LIFECYCLE_STATES.DELETING);

    if (retryError) {
      if (isGraceSchemaUnavailable(retryError)) {
        warnGraceSchemaUnavailable(retryError);
        return;
      }
      console.error(
        `CRITICAL: Failed to persist retry state for ${row.service_table}:${row.service_id}: ${retryError.message}`
      );
      continue;
    }

    console.error(
      `CRITICAL: Grace deletion failed for ${row.service_table}:${row.service_id} (attempt ${attemptNumber}/${GRACE_CONFIG.DELETE_MAX_RETRIES}): ${errorMessage}`
    );
  }
}

async function dispatchPendingGraceOutboxEvents() {
  if (!GRACE_CONFIG.ENABLED) return;

  const response = await postInternalCronRoute("/api/internal/billing/grace-events/process", {
    limit: 100,
  });

  if (response.skipped) {
    return;
  }

  if (!response.ok) {
    console.error(
      "CRITICAL: Grace outbox dispatch failed:",
      response.errorMessage || "Unknown processing error"
    );
    return;
  }

  const processed = Number(response.data?.processed || 0);
  const failed = Number(response.data?.failed || 0);
  const skipped = Number(response.data?.skipped || 0);

  if (processed > 0 || failed > 0 || skipped > 0) {
    console.log(
      `Grace outbox dispatch: processed=${processed}, failed=${failed}, skipped=${skipped}`
    );
  }
}

async function getBalanceAfterDeduction(userId) {
  try {
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
  } catch (error) {
    console.warn(
      `⚠️ Failed to fetch balance after deduction for ${userId}: ${error?.message || String(error)}`
    );
    return null;
  }
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

  let error = null;
  try {
    const result = await supabase
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
        hours_used: Number(hoursUsed.toFixed(2)),
      },
      completed_at: periodEnd,
    });
    error = result?.error || null;
  } catch (caughtError) {
    error = {
      code: "CLIENT_SHAPE_MISMATCH",
      message: caughtError?.message || String(caughtError),
    };
  }

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
      2
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

    if (status === "insufficient_credit") {
      await startGraceLifecycleForInsufficientCredit({
        tableName,
        serviceId: service_id,
        userId: user_id,
        hourlyRate: rate,
        attemptedAmount: finalCost,
        availableBalance: cycleResult?.new_balance ?? null,
        occurredAtIso: billedAtIso,
      });
    }

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

    const results = await Promise.allSettled(
      BILLING_SERVICE_TABLES.map((tableName) => processServiceTable(tableName))
    );

    // Log any table processing failures
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(
          `CRITICAL: Failed to process table ${BILLING_SERVICE_TABLES[index]}:`,
          result.reason
        );
      }
    });

    if (GRACE_CONFIG.ENABLED) {
      await enqueueGraceReminderEvents();
      await executeGraceDeletionForExpiredServices();
      await dispatchPendingGraceOutboxEvents();
    }

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

// -----------------------------
// DOMAIN TRANSFER POLL
// Runs every 30 minutes — polls Name.com for status updates on pending
// transfers. Transfers stay stuck forever without this job because the
// poll endpoint is never called otherwise.
// -----------------------------
cron.schedule("*/30 * * * *", async () => {
  const appUrl = process.env.DOMAIN;
  const cronSecret = process.env.CRON_SECRET;

  if (!appUrl || !cronSecret) {
    console.warn("[domain-transfer-poll] Skipped: DOMAIN or CRON_SECRET not set");
    return;
  }

  try {
    console.log("[domain-transfer-poll] Polling pending transfers:", new Date().toISOString());
    const res = await fetch(`${appUrl}/api/domains/transfer/poll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ limit: 50 }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("[domain-transfer-poll] Poll failed:", data);
    } else {
      console.log("[domain-transfer-poll] Poll completed:", data.message);
    }
  } catch (error) {
    console.error("[domain-transfer-poll] Poll error:", error.message);
  }
});

// -----------------------------
// DOMAIN RENEWAL BILLING
// Runs daily at 09:00 UTC — charges users' credit balances for domains
// expiring within the next 30 days. Name.com handles the actual renewal
// from the platform account. No extra cron needed for the renewal itself.
// -----------------------------
cron.schedule("0 9 * * *", async () => {
  const appUrl = process.env.DOMAIN;
  const cronSecret = process.env.CRON_SECRET;

  if (!appUrl || !cronSecret) {
    console.warn("[domain-renewal] Skipped: DOMAIN or CRON_SECRET not set");
    return;
  }

  try {
    console.log("[domain-renewal] Running renewal billing:", new Date().toISOString());
    const res = await fetch(`${appUrl}/api/domains/renewal/poll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ limit: 50, days_ahead: 30 }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("[domain-renewal] Renewal billing failed:", data);
    } else {
      console.log("[domain-renewal] Renewal billing completed:", data.message);
    }
  } catch (error) {
    console.error("[domain-renewal] Renewal billing error:", error.message);
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
console.log(
  "Grace auto-delete:",
  GRACE_CONFIG.ENABLED
    ? `enabled (${GRACE_CONFIG.PERIOD_DAYS}d grace, reminders=${GRACE_CONFIG.REMINDER_OFFSETS_DAYS.join(
        ","
      )}d, final=${GRACE_CONFIG.FINAL_WARNING_HOURS}h, retries=${GRACE_CONFIG.DELETE_MAX_RETRIES})`
    : "disabled"
);
console.log("Next run:", new Date(Date.now() + 5 * 60 * 1000).toISOString());

