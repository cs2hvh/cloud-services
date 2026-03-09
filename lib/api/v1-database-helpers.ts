import { NextResponse } from "next/server";

import { Database_Clusters } from "@/lib/supabase/queries/database_clusters";
import { v1ExtractId, type RouteContext } from "@/lib/api/v1-helpers";
import { v1Error } from "@/lib/api/v1-middleware";

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

  try {
    return { value: decodeURIComponent(raw), error: null };
  } catch {
    return { value: raw, error: null };
  }
}

export async function v1EnsureOwnedDatabaseCluster(
  clusterId: string,
  userId: string,
  action: "access" | "modify" | "delete" = "access"
): Promise<{ cluster: Record<string, unknown>; error: null } | { cluster: null; error: NextResponse }> {
  const clusterResult = await Database_Clusters.read(clusterId);

  if (!clusterResult.success || !clusterResult.data) {
    return {
      cluster: null,
      error: v1Error("NOT_FOUND", 404, "Database cluster not found"),
    };
  }

  if (clusterResult.data.status === "deleted") {
    return {
      cluster: null,
      error: v1Error("NOT_FOUND", 404, "Database cluster not found"),
    };
  }

  if (clusterResult.data.owner_id !== userId) {
    return {
      cluster: null,
      error: v1Error("FORBIDDEN", 403, `You do not have permission to ${action} this database cluster`),
    };
  }

  return {
    cluster: clusterResult.data as unknown as Record<string, unknown>,
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
    case "DATABASE_HAS_ACTIVE_LINKS":
      return v1Error("DATABASE_HAS_ACTIVE_LINKS", 409, message, {
        linked_apps_count: failure.linkedAppsCount ?? 0,
        linked_app_names: failure.linkedAppNames ?? [],
      });
    case "DIGITALOCEAN_API_ERROR":
      return v1Error("INVALID_PARAMETER", 400, message);
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
  if (lowered.includes("already exists") || lowered.includes("duplicate") || lowered.includes("conflict")) {
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
