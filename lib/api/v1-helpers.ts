/**
 * V1 API Helper Functions
 * Simple, reusable utilities for common patterns in v1 API endpoints
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { v1Error, v1ValidationError } from "./v1-middleware";
import { v1Forbidden } from "./v1-errors";

/**
 * Route context type from Next.js 15
 */
export type RouteContext = { params: Promise<{ [key: string]: string | string[] }> };

/**
 * Extract and validate UUID from route params
 * @param context - Next.js route context
 * @param paramName - Name of the param to extract (default: 'id')
 * @returns Object with id and error (one will be null)
 * 
 * @example
 * const { id, error } = await v1ExtractId(context);
 * if (error) return error;
 */
export async function v1ExtractId(
  context: RouteContext | undefined,
  paramName: string = "id"
): Promise<{ id: string; error: null } | { id: null; error: NextResponse }> {
  if (!context?.params) {
    return {
      id: null,
      error: v1Error("INTERNAL_ERROR", 500, "Missing route context"),
    };
  }

  const rawParams = await context.params;
  const value = Array.isArray(rawParams[paramName])
    ? rawParams[paramName][0]
    : rawParams[paramName];

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!value || !uuidRegex.test(value)) {
    return {
      id: null,
      error: v1Error("INVALID_ID", 400, `Invalid ${paramName} format`, {
        field: paramName,
      }),
    };
  }

  return { id: value, error: null };
}

/**
 * Verify resource ownership
 * @param resourceOwnerId - User ID that owns the resource
 * @param currentUserId - Current authenticated user ID
 * @param resourceType - Type of resource for error message
 * @param action - Action being attempted
 * @returns Error response if not owner, null if authorized
 * 
 * @example
 * const ownershipError = v1VerifyOwnership(app.user_id, auth.userId, 'app', 'delete');
 * if (ownershipError) return ownershipError;
 */
export function v1VerifyOwnership(
  resourceOwnerId: string,
  currentUserId: string,
  resourceType: string,
  action: "access" | "modify" | "delete" = "access"
): NextResponse | null {
  if (resourceOwnerId !== currentUserId) {
    return v1Forbidden(resourceType, action);
  }
  return null;
}

/**
 * Transform Zod validation error to v1 error format
 * @param zodError - Zod validation error
 * @returns Formatted validation error response
 * 
 * @example
 * if (!validation.success) {
 *   return v1TransformValidationError(validation.error);
 * }
 */
export function v1TransformValidationError(zodError: z.ZodError): NextResponse {
  const errors = zodError.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  return v1ValidationError(errors);
}
