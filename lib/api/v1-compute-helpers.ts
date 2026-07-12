/**
 * V1 Compute API helpers — instance id extraction, owner-scoped row loading,
 * row→wire serialization, and flow-failure translation for the
 * /api/v1/compute/* endpoints.
 *
 * Unlike most v1 resources, compute instances use a numeric id (servers.id
 * is a bigint), so the UUID-based v1ExtractId helper does not apply here.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { v1Error } from "./v1-middleware";
import { v1NotFound, v1Forbidden } from "./v1-errors";
import type { RouteContext } from "./v1-helpers";
import { linodeTypeIdFromSlug } from "@/lib/services/compute/providers/linode/ops";
import type { LinodeFlowFailure } from "@/lib/services/compute/providers/linode/flows";

/** Columns needed to serialize an instance for the v1 wire format. */
export const COMPUTE_INSTANCE_COLUMNS =
  "id, name, status, provider, linode_id, location, plan_slug, os, ip, cpu_cores, memory_mb, disk_gb, hourly_cost, monthly_cost, billing_service_id, details, owner_id, owner_email, created_at";

/**
 * Extract and validate the numeric instance id from route params.
 */
export async function v1ExtractInstanceId(
  context: RouteContext | undefined,
  paramName: string = "instanceId"
): Promise<{ id: number; error: null } | { id: null; error: NextResponse }> {
  if (!context?.params) {
    return { id: null, error: v1Error("INTERNAL_ERROR", 500, "Missing route context") };
  }

  const rawParams = await context.params;
  const value = Array.isArray(rawParams[paramName])
    ? rawParams[paramName][0]
    : rawParams[paramName];

  if (!value || !/^\d+$/.test(value)) {
    return {
      id: null,
      error: v1Error("INVALID_ID", 400, `Invalid ${paramName} format`, { field: paramName }),
    };
  }

  return { id: Number(value), error: null };
}

/** Owner-scoped instance load: 404 when missing, 403 when not the owner. */
export async function v1LoadOwnedInstance(
  supabase: SupabaseClient,
  instanceId: number,
  userId: string,
  action: "access" | "modify" | "delete" = "access"
): Promise<
  | { server: Record<string, unknown>; error: null }
  | { server: null; error: NextResponse }
> {
  const { data: server, error } = await supabase
    .from("servers")
    .select(COMPUTE_INSTANCE_COLUMNS)
    .eq("id", instanceId)
    .maybeSingle();

  if (error) {
    return { server: null, error: v1Error("INTERNAL_ERROR", 500, "Failed to load instance") };
  }
  if (!server) {
    return { server: null, error: v1NotFound("instance") };
  }
  if ((server as Record<string, unknown>).owner_id !== userId) {
    return { server: null, error: v1Forbidden("instance", action) };
  }
  return { server: server as Record<string, unknown>, error: null };
}

export interface ComputeInstanceWire {
  id: number;
  label: string | null;
  status: string | null;
  provider: string;
  region: string | null;
  type: string | null;
  image: string | null;
  ipv4: string | null;
  specs: { vcpus: number; memory_mb: number; disk_gb: number };
  pricing: { hourly: number | null; monthly: number | null };
  backups_enabled: boolean;
  created_at: string | null;
}

/** Map a servers row to the public v1 wire format. */
export function serializeComputeInstance(row: Record<string, unknown>): ComputeInstanceWire {
  const details = (row.details ?? {}) as Record<string, unknown>;
  const linode = (details.linode ?? {}) as Record<string, unknown>;
  const planSlug = (row.plan_slug as string | null) ?? null;

  const toNumberOrNull = (v: unknown): number | null =>
    v === null || v === undefined ? null : Number(v);

  return {
    id: Number(row.id),
    label: (row.name as string | null) ?? null,
    status: (row.status as string | null) ?? null,
    provider: (row.provider as string | null) ?? "proxmox",
    region: (row.location as string | null) ?? null,
    // Linode rows store 'linode:<type_id>' — strip the prefix for the wire.
    type: linodeTypeIdFromSlug(planSlug) ?? planSlug,
    image: (row.os as string | null) ?? null,
    ipv4: (row.ip as string | null) ?? null,
    specs: {
      vcpus: Number(row.cpu_cores ?? 0),
      memory_mb: Number(row.memory_mb ?? 0),
      disk_gb: Number(row.disk_gb ?? 0),
    },
    pricing: {
      hourly: toNumberOrNull(row.hourly_cost),
      monthly: toNumberOrNull(row.monthly_cost),
    },
    backups_enabled: linode.backups_enabled === true,
    created_at: (row.created_at as string | null) ?? null,
  };
}

/** Translate an HTTP-ish flow failure into the standard v1 error envelope. */
export function v1ComputeFlowError(failure: LinodeFlowFailure): NextResponse {
  const code =
    failure.status === 400
      ? "VALIDATION_ERROR"
      : failure.status === 402
        ? "INSUFFICIENT_BALANCE"
        : failure.status === 404
          ? "NOT_FOUND"
          : failure.status === 409
            ? "CONFLICT"
            : failure.status === 422
              ? "INVALID_STATE"
              : failure.status === 429
                ? "RATE_LIMIT_EXCEEDED"
                : failure.status === 502 || failure.status === 503
                  ? "PROVIDER_ERROR"
                  : "INTERNAL_ERROR";
  return v1Error(code, failure.status, failure.message);
}
