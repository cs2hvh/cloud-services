/**
 * V1 API Error Codes Registry
 * Centralized error definitions for consistent error handling across all v1 endpoints
 */
import { NextResponse } from "next/server";
import { v1Error } from "./v1-middleware";

/**
 * Standard error code definitions
 * Each error has a code, HTTP status, and default message
 */
export const V1_ERROR_CODES = {
  // Authentication Errors (401)
  UNAUTHORIZED: {
    code: "UNAUTHORIZED",
    status: 401,
    message: "Missing or invalid API key",
  },

  // Authorization Errors (403)
  FORBIDDEN: {
    code: "FORBIDDEN",
    status: 403,
    message: "You do not have permission to access this resource",
  },

  // Not Found Errors (404)
  NOT_FOUND: {
    code: "NOT_FOUND",
    status: 404,
    message: "Resource not found",
  },

  // Validation Errors (400)
  VALIDATION_ERROR: {
    code: "VALIDATION_ERROR",
    status: 400,
    message: "Invalid request body",
  },

  INVALID_ID: {
    code: "INVALID_ID",
    status: 400,
    message: "Invalid ID format",
  },

  INVALID_PARAMETER: {
    code: "INVALID_PARAMETER",
    status: 400,
    message: "Invalid parameter value",
  },

  // Conflict Errors (409)
  ALREADY_EXISTS: {
    code: "ALREADY_EXISTS",
    status: 409,
    message: "Resource already exists",
  },

  // Rate Limiting (429)
  RATE_LIMIT_EXCEEDED: {
    code: "RATE_LIMIT_EXCEEDED",
    status: 429,
    message: "Too many requests. Please try again later.",
  },

  // Server Errors (500+)
  INTERNAL_ERROR: {
    code: "INTERNAL_ERROR",
    status: 500,
    message: "Internal server error",
  },

  CREATE_FAILED: {
    code: "CREATE_FAILED",
    status: 500,
    message: "Failed to create resource",
  },

  UPDATE_FAILED: {
    code: "UPDATE_FAILED",
    status: 500,
    message: "Failed to update resource",
  },

  DELETE_FAILED: {
    code: "DELETE_FAILED",
    status: 500,
    message: "Failed to delete resource",
  },

  SERVICE_UNAVAILABLE: {
    code: "SERVICE_UNAVAILABLE",
    status: 503,
    message: "Service temporarily unavailable",
  },
} as const;

export type V1ErrorCode = keyof typeof V1_ERROR_CODES;

/**
 * Get standardized error response by code
 * @param code - Error code from V1_ERROR_CODES
 * @param customMessage - Optional custom message to override default
 * @param details - Optional additional error details
 */
export function v1GetError(
  code: V1ErrorCode,
  customMessage?: string,
  details?: Record<string, unknown>
): NextResponse {
  const errorDef = V1_ERROR_CODES[code];
  return v1Error(
    errorDef.code,
    errorDef.status,
    customMessage || errorDef.message,
    details
  );
}

/**
 * Standard not found error with resource type
 * @param resourceType - Type of resource (e.g., 'app', 'database', 'cluster')
 */
export function v1NotFound(resourceType: string): NextResponse {
  const resourceName = resourceType.charAt(0).toUpperCase() + resourceType.slice(1);
  return v1Error("NOT_FOUND", 404, `${resourceName} not found`);
}

/**
 * Standard forbidden error with resource type and action
 * @param resourceType - Type of resource
 * @param action - Action being attempted (e.g., 'access', 'modify', 'delete')
 */
export function v1Forbidden(
  resourceType: string,
  action: "access" | "modify" | "delete" = "access"
): NextResponse {
  return v1Error(
    "FORBIDDEN",
    403,
    `You do not have permission to ${action} this ${resourceType}`
  );
}
