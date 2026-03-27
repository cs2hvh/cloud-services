import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Validate required environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ FATAL: Missing required environment variables");
  console.error("Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// -----------------------------
// 1. SUPABASE CLIENT
// -----------------------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // must be service role!!
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
];

export async function billSingleService(tableName, svc) {
  // Validate table name to prevent SQL injection
  if (!VALID_TABLE_NAMES.includes(tableName)) {
    console.error(`❌ SECURITY: Invalid table name attempted: ${tableName}`);
    return;
  }

  const { service_id, user_id, hourly_rate, last_billed_at, created_at } = svc;

  // Validate required fields exist
  if (!service_id || !user_id || hourly_rate === undefined) {
    console.error(`❌ SECURITY: Missing required fields in service record`, {
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
      `❌ SECURITY: Invalid service_id format (not a valid UUID): ${service_id}`
    );
    return;
  }

  if (!UUID_REGEX.test(user_id)) {
    console.error(
      `❌ SECURITY: Invalid user_id format (not a valid UUID): ${user_id}`
    );
    return;
  }

  const now = new Date();

  const last = last_billed_at
    ? new Date(
        typeof last_billed_at === "string"
          ? last_billed_at.endsWith("Z") ||
            /[+-]\d{2}:?\d{2}$/.test(last_billed_at)
            ? last_billed_at
            : `${last_billed_at}Z`
          : last_billed_at
      )
    : null;

  let hoursUsed;
  if (last) {
    hoursUsed = (now - last) / (1000 * 60 * 60);
  } else if (created_at) {
    const createdDate = new Date(created_at);
    // Validate created_at is not in the future or too far in the past
    if (
      isNaN(createdDate.getTime()) ||
      createdDate > now ||
      createdDate < new Date("2020-01-01")
    ) {
      console.error(
        `❌ SECURITY: Invalid created_at date for service ${service_id}: ${created_at}`
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
      `⚠️ SECURITY: Hours exceeded maximum (${hoursUsed.toFixed(2)} > ${
        SECURITY_LIMITS.MAX_HOURS_PER_BILLING
      }) for service ${service_id}, capping to max`
    );
    hoursUsed = SECURITY_LIMITS.MAX_HOURS_PER_BILLING;
  }

  // Prevent negative hours from clock skew or bad data
  if (hoursUsed < 0) {
    console.error(
      `❌ SECURITY: Negative hours calculated for service ${service_id}, skipping`
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
        `❌ SECURITY: Malformed hourly_rate string for ${tableName} service_id=${service_id}: "${hourly_rate}"`
      );
      return;
    }
  } else {
    console.error(
      `❌ SECURITY: Invalid hourly_rate type for ${tableName} service_id=${service_id}: ${typeof hourly_rate}`
    );
    return;
  }

  // Validate rate bounds
  if (isNaN(rate) || !isFinite(rate)) {
    console.error(
      `❌ SECURITY: Non-numeric hourly_rate for ${tableName} service_id=${service_id}: ${hourly_rate}`
    );
    return;
  }

  if (rate < SECURITY_LIMITS.MIN_HOURLY_RATE) {
    console.error(
      `❌ SECURITY: Rate below minimum (${rate} < ${SECURITY_LIMITS.MIN_HOURLY_RATE}) for service ${service_id}`
    );
    return;
  }

  if (rate > SECURITY_LIMITS.MAX_HOURLY_RATE) {
    console.error(
      `❌ SECURITY: Rate exceeds maximum (${rate} > ${SECURITY_LIMITS.MAX_HOURLY_RATE}) for service ${service_id}, capping to max`
    );
    rate = SECURITY_LIMITS.MAX_HOURLY_RATE;
  }

  // Calculate cost with precision rounding to avoid floating-point errors
  // Round to 6 decimal places for sub-cent precision, then to 4 for billing
  const rawCost = hoursUsed * rate;
  const cost = Math.round(rawCost * 10000) / 10000; // Round to 4 decimal places

  // Security: Skip billing if cost is below minimum threshold (prevents dust transactions)
  if (cost < SECURITY_LIMITS.MIN_BILLABLE_COST) {
    console.log(
      `ℹ️  Skipping billing for ${tableName} service_id=${service_id}: cost $${cost.toFixed(4)} below minimum $${SECURITY_LIMITS.MIN_BILLABLE_COST}`
    );
    return;
  }

  // Security: Cap cost per billing cycle
  const finalCost = Math.min(cost, SECURITY_LIMITS.MAX_COST_PER_CYCLE);
  if (cost > SECURITY_LIMITS.MAX_COST_PER_CYCLE) {
    console.warn(
      `⚠️ SECURITY: Cost $${cost.toFixed(4)} exceeds maximum $${SECURITY_LIMITS.MAX_COST_PER_CYCLE} for service ${service_id}, capping`
    );
  }

  console.log(
    `💸 Billing ${tableName} → service_id=${service_id}, user_id=${user_id}, hours=${hoursUsed.toFixed(
      4
    )}, rate=${rate}, cost=$${finalCost.toFixed(4)}`
  );

  // CRITICAL FIX: Update last_billed_at BEFORE deducting credit to prevent double billing
  // If credit deduction fails, timestamp is updated but no charge occurs (safer than opposite)
  const { error: updateError } = await supabase
    .schema("billing")
    .from(tableName)
    .update({ last_billed_at: now.toISOString() })
    .eq("service_id", service_id);

  if (updateError) {
    console.error(
      `❌ CRITICAL: Failed updating last_billed_at for ${tableName}`,
      {
        service_id,
        error: updateError.message || "Unknown error", // Sanitize: only log message, not full object
        error_code: updateError.code,
        timestamp: new Date().toISOString(),
        note: "Timestamp update failed - skipping billing to prevent errors",
      }
    );
    return;
  }

  // Deduct credit after timestamp is safely updated
  const { error: creditError } = await supabase
    .schema("billing")
    .rpc("deduct_user_credit_atomic", {
      p_user_id: user_id,
      p_amount: finalCost, // Use capped cost
    });

  if (creditError) {
    console.error(`❌ CRITICAL: Credit deduction failed for ${tableName}`, {
      service_id,
      user_id,
      cost: finalCost,
      error: creditError.message || "Unknown error", // Sanitize: only log message
      error_code: creditError.code,
      timestamp: new Date().toISOString(),
      note: "Timestamp was updated but billing failed - user not charged for this period",
    });
    // TODO: Implement alerting system here
    // TODO: Track failed billing attempts and suspend service if needed
    return;
  }

  console.log(
    `✅ Successfully billed ${tableName} service_id=${service_id}, cost=$${finalCost.toFixed(
      4
    )}`
  );
}

export async function processServiceTable(tableName) {
  try {
    console.log(
      `💾 Fetching active services from billing schema table ${tableName}...`
    );

    const { data: services, error } = await supabase
      .schema("billing")
      .from(tableName)
      .select("*")
      .eq("status", "active");

    if (error) {
      console.error(`❌ Error fetching ${tableName}:`, {
        message: error.message || "Unknown error",
        code: error.code,
      });
      return;
    }

    if (!services || services.length === 0) {
      console.log(`ℹ️  No active services in ${tableName}`);
      return;
    }

    console.log(
      `📊 Processing ${services.length} active services from ${tableName}`
    );

    for (const svc of services) {
      try {
        await billSingleService(tableName, svc);
      } catch (error) {
        console.error(`❌ CRITICAL: Failed to bill service in ${tableName}:`, {
          service_id: svc.service_id,
          error: error.message,
          stack: error.stack,
        });
        // Continue processing other services even if one fails
      }
    }
  } catch (error) {
    console.error(`❌ CRITICAL: processServiceTable failed for ${tableName}:`, {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    throw error; // Re-throw to be caught by Promise.allSettled
  }
}

// Run every 60 minutes for testing (3600 seconds)

cron.schedule('0 * * * *', async () => {
  try {
    console.log("⏳ Billing cycle started:", new Date().toISOString());

    const results = await Promise.allSettled([
      processServiceTable("active_kubernetes"),
      processServiceTable("active_database"),
      processServiceTable("active_objectspace"),
      processServiceTable("active_spectrum"),
    ]);

    // Log any table processing failures
    results.forEach((result, index) => {
      const tables = [
        "active_kubernetes",
        "active_database",
        "active_objectspace",
        "active_spectrum",
      ];
      if (result.status === "rejected") {
        console.error(
          `❌ CRITICAL: Failed to process table ${tables[index]}:`,
          result.reason
        );
      }
    });

    console.log("✅ Billing cycle completed:", new Date().toISOString());
  } catch (error) {
    console.error("❌ CRITICAL: Billing cycle crashed:", {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
    // Don't throw - let cron continue to next cycle
  }
});

console.log("🚀 Cron worker started successfully");
console.log("📅 Schedule: Every 1 hr(0 * * * *)");
console.log("🔧 Supabase connected:", process.env.SUPABASE_URL ? "✓" : "✗");
console.log(
  "🛡️  Security limits: Max rate=$" +
    SECURITY_LIMITS.MAX_HOURLY_RATE +
    "/hr, Max hours=" +
    SECURITY_LIMITS.MAX_HOURS_PER_BILLING +
    "h, Max cost/cycle=$" +
    SECURITY_LIMITS.MAX_COST_PER_CYCLE +
    ", Min billable=$" +
    SECURITY_LIMITS.MIN_BILLABLE_COST
);
console.log("⏰ Next run:", new Date(Date.now() + 6 * 60 * 1000).toISOString());
