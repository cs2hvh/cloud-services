import { createServiceClient } from "@/lib/supabase/server";
import {
  getRecoveryMinHoursCoverage,
  GRACE_ACTIVE_STATES,
  isGraceServiceTable,
  type GraceServiceTable,
} from "@/lib/billing/grace/constants";
import { enqueueGraceOutboxEvent } from "@/lib/billing/grace/outbox";

type ResolvedGraceRow = {
  service_table: GraceServiceTable;
  service_id: string;
  new_state: "restored" | "deleted";
  required_balance: number;
  available_balance: number;
};

function isSchemaMissingError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = String(error.message || "").toLowerCase();
  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    message.includes("resolve_grace_for_user") ||
    message.includes("function") ||
    message.includes("does not exist")
  );
}

async function readUserBalance(userId: string): Promise<number> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .schema("billing")
    .from("user_credits")
    .select("credit_balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return 0;
  const raw = data.credit_balance;
  return typeof raw === "number" ? raw : Number(raw ?? 0);
}

async function getActiveServiceHourlyRate(
  serviceTable: GraceServiceTable,
  serviceId: string
): Promise<number | null> {
  const supabase = await createServiceClient();

  const byServiceId = await supabase
    .schema("billing")
    .from(serviceTable)
    .select("hourly_rate")
    .eq("service_id", serviceId)
    .eq("status", "active")
    .maybeSingle();

  if (byServiceId.data?.hourly_rate != null) {
    const rate = Number(byServiceId.data.hourly_rate);
    return Number.isFinite(rate) ? rate : null;
  }

  // Backward-compatibility path for environments where active table uses id.
  const byId = await supabase
    .schema("billing")
    .from(serviceTable)
    .select("hourly_rate")
    .eq("id", serviceId)
    .eq("status", "active")
    .maybeSingle();

  if (byId.data?.hourly_rate != null) {
    const rate = Number(byId.data.hourly_rate);
    return Number.isFinite(rate) ? rate : null;
  }

  return null;
}

async function runFallbackResolver(params: {
  userId: string;
  minCoverageHours: number;
}): Promise<ResolvedGraceRow[]> {
  const supabase = await createServiceClient();
  const balance = await readUserBalance(params.userId);

  const { data: rows, error } = await supabase
    .schema("billing")
    .from("service_lifecycle")
    .select("id, service_table, service_id, state, grace_expires_at")
    .eq("user_id", params.userId)
    .in("state", [...GRACE_ACTIVE_STATES]);

  if (error || !rows?.length) return [];

  const resolvedRows: ResolvedGraceRow[] = [];

  for (const row of rows) {
    if (!isGraceServiceTable(row.service_table)) continue;
    const serviceId = String(row.service_id);
    const hourlyRate = await getActiveServiceHourlyRate(row.service_table, serviceId);

    if (hourlyRate == null) {
      const { error: updateDeletedError } = await supabase
        .schema("billing")
        .from("service_lifecycle")
        .update({
          state: "deleted",
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            resolved_reason: "active_row_missing",
            resolved_by: "topup_fallback",
          },
        })
        .eq("id", row.id);

      if (!updateDeletedError) {
        resolvedRows.push({
          service_table: row.service_table,
          service_id: serviceId,
          new_state: "deleted",
          required_balance: 0,
          available_balance: balance,
        });
      }

      continue;
    }

    const required = Math.max(hourlyRate * params.minCoverageHours, 0);
    if (balance < required) continue;

    const { error: updateRestoredError } = await supabase
      .schema("billing")
      .from("service_lifecycle")
      .update({
        state: "restored",
        updated_at: new Date().toISOString(),
        metadata: {
          resolved_reason: "topup",
          resolved_by: "topup_fallback",
          min_hours_coverage: params.minCoverageHours,
        },
      })
      .eq("id", row.id);

    if (!updateRestoredError) {
      resolvedRows.push({
        service_table: row.service_table,
        service_id: serviceId,
        new_state: "restored",
        required_balance: required,
        available_balance: balance,
      });
    }
  }

  return resolvedRows;
}

async function queueResolvedEvents(userId: string, rows: ResolvedGraceRow[]): Promise<void> {
  for (const row of rows) {
    if (row.new_state !== "restored") continue;

    await enqueueGraceOutboxEvent({
      eventKey: `grace_resolved:${row.service_table}:${row.service_id}`,
      eventType: "grace_resolved",
      userId,
      serviceTable: row.service_table,
      serviceId: row.service_id,
      payload: {
        required_balance: row.required_balance,
        available_balance: row.available_balance,
      },
    });
  }
}

export async function resolveGraceForUserAfterTopup(params: {
  userId: string;
  minCoverageHours?: number;
}): Promise<{ restoredCount: number; resolvedRows: ResolvedGraceRow[] }> {
  const supabase = await createServiceClient();
  const minCoverageHours = params.minCoverageHours ?? getRecoveryMinHoursCoverage();

  const { data, error } = await supabase.rpc("resolve_grace_for_user", {
    p_user_id: params.userId,
    p_min_hours_coverage: minCoverageHours,
  });

  let resolvedRows: ResolvedGraceRow[] = [];

  if (error) {
    if (!isSchemaMissingError(error)) {
      throw new Error(`Failed to resolve grace: ${error.message}`);
    }

    resolvedRows = await runFallbackResolver({
      userId: params.userId,
      minCoverageHours,
    });
  } else if (Array.isArray(data)) {
    resolvedRows = data
      .filter(
        (row): row is ResolvedGraceRow =>
          row &&
          typeof row === "object" &&
          isGraceServiceTable(String((row as { service_table?: string }).service_table ?? "")) &&
          typeof (row as { service_id?: string }).service_id === "string" &&
          (row as { new_state?: string }).new_state === "restored"
      )
      .map((row) => ({
        service_table: row.service_table,
        service_id: row.service_id,
        new_state: "restored",
        required_balance: Number(row.required_balance ?? 0),
        available_balance: Number(row.available_balance ?? 0),
      }));
  }

  if (resolvedRows.length > 0) {
    await queueResolvedEvents(params.userId, resolvedRows);
  }

  return {
    restoredCount: resolvedRows.filter((row) => row.new_state === "restored").length,
    resolvedRows,
  };
}
