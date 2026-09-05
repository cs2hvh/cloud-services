import { NextResponse } from "next/server";

import { resolveOwnedCluster } from "@/lib/services/database/operations/cluster-access";
import { v1ExtractId, type RouteContext } from "@/lib/api/v1-helpers";
import { v1Error } from "@/lib/api/v1-middleware";
import { isProviderSegment } from "@/lib/services/database/operations/provider-path";

type DatabaseServiceFailure = {
  error?: string;
  errorCode?: string;
  linkedAppsCount?: number;
  linkedAppNames?: string[];
};

export async function v1ExtractDatabaseId(context: RouteContext | undefined) {
  return v1ExtractId(context, "id");
}

export async function v1ExtractStringParam(
  context: RouteContext | undefined,
  paramName: string,
  fieldLabel: string
): Promise<{ value: string; error: null } | { value: null; error: NextResponse }> {
  if (!context?.params) {
    return {
      value: null,
      error: v1Error("INTERNAL_ERROR", 500, "Missing route context"),
    };
  }

  const rawParams = await context.params;
  const raw = Array.isArray(rawParams[paramName]) ? rawParams[paramName][0] : rawParams[paramName];

  if (!raw || typeof raw !== "string") {
    return {
      value: null,
      error: v1Error("INVALID_PARAMETER", 400, `Missing ${fieldLabel}`, { field: paramName }),
    };
  }

  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    value = raw;
  }
  // A database name or username becomes a segment of the DigitalOcean URL.
  // Refuse here, with a clear 400, what provider-path.ts would refuse deeper
  // down: `..%2F..%2F<other-cluster>` used to climb out of the caller-owned
  // cluster after the ownership check had already passed.
  if ((paramName === "name" || paramName === "username") && !isProviderSegment(value)) {
    return {
      value: null,
      error: v1Error("INVALID_PARAMETER", 400, `Invalid ${fieldLabel}: only letters, digits, underscore, dot and hyphen are allowed`, { field: paramName }),
    };
  }
  return { value, error: null };
}

export async function v1EnsureOwnedDatabaseCluster(
  clusterId: string,
  userId: string,
  action: "access" | "modify" | "delete" = "access"
): Promise<{ cluster: Record<string, unknown>; error: null } | { cluster: null; error: NextResponse }> {
  const clusterResult = await resolveOwnedCluster(clusterId, userId, action);
  if (!clusterResult.success) {
    return {
      cluster: null,
      error: v1Error(clusterResult.errorCode, clusterResult.statusCode, clusterResult.error),
    };
  }

  return {
    cluster: clusterResult.cluster,
    error: null,
  };
}

export function v1DatabaseServiceError(
  failure: DatabaseServiceFailure,
  fallbackCode: string,
  fallbackMessage: string
): NextResponse {
  const message = failure.error || fallbackMessage;

  switch (failure.errorCode) {
    case "INSUFFICIENT_BALANCE":
      return v1Error("INSUFFICIENT_CREDITS", 402, message);
    case "SERVER_BUSY":
      return v1Error("SERVICE_UNAVAILABLE", 503, message);
    case "NOT_FOUND":
      return v1Error("NOT_FOUND", 404, message);
    case "INVALID_PARAMETER":
      return v1Error("INVALID_PARAMETER", 400, message);
    case "ALREADY_EXISTS":
      return v1Error("ALREADY_EXISTS", 409, message);
    case "DATABASE_HAS_ACTIVE_LINKS":
      return v1Error("DATABASE_HAS_ACTIVE_LINKS", 409, message, {
        linked_apps_count: failure.linkedAppsCount ?? 0,
        linked_app_names: failure.linkedAppNames ?? [],
      });
    case "PROVIDER_API_ERROR":
      return v1Error("INVALID_PARAMETER", 400, message);
    case "UNSUPPORTED_OPERATION":
      return v1Error("UNSUPPORTED_OPERATION", 422, message);
    case "POST_PROVISION_BILLING_FAILED":
    case "SUPABASE_INSERT_FAILED":
    case "SUPABASE_DELETE_FAILED":
    case "UNKNOWN_ERROR":
      return v1Error(fallbackCode, 500, message);
    default:
      break;
  }

  const lowered = message.toLowerCase();
  if (lowered.includes("not found")) {
    return v1Error("NOT_FOUND", 404, message);
  }
  if (lowered.includes("not authorized") || lowered.includes("unauthorized") || lowered.includes("permission")) {
    return v1Error("FORBIDDEN", 403, message);
  }
  if (lowered.includes("not supported") || lowered.includes("unsupported") || lowered.includes("invalid request")) {
    return v1Error("INVALID_PARAMETER", 400, message);
  }
  if (
    lowered.includes("cannot delete defaultdb") ||
    lowered.includes("cannot delete default database")
  ) {
    return v1Error("INVALID_PARAMETER", 400, message);
  }
  if (lowered.includes("already exists") || lowered.includes("duplicate") || lowered.includes("conflict")) {
    return v1Error("ALREADY_EXISTS", 409, message);
  }
  if (
    lowered.includes("name is not available") ||
    (lowered.includes("database name") && lowered.includes("not available"))
  ) {
    return v1Error("ALREADY_EXISTS", 409, message);
  }

  return v1Error(fallbackCode, 500, message);
}

export function v1ParseBooleanQuery(value: string | null): boolean | undefined {
  if (value === null) {
    return undefined;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

export function v1ResolveDatabaseClusterId(cluster: Record<string, unknown>, fallbackId: string): string {
  const clusterId = cluster.cluster_id;
  if (typeof clusterId === "string" && clusterId.length > 0) {
    return clusterId;
  }
  return fallbackId;
}
