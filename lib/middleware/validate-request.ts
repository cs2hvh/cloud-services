import { NextResponse } from "next/server";
import { ZodSchema, ZodError } from "zod";

/**
 * Type-safe validation result
 */
type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; response: NextResponse };

/**
 * Validates request payload against a Zod schema
 * Returns validated data or an error response
 * 
 * @param schema - Zod schema to validate against
 * @param body - Request body to validate
 * @returns ValidationResult with either validated data or error response
 * 
 * @example
 * ```typescript
 * const result = validateRequest(createDatabaseSchema, body);
 * if (!result.success) return result.response;
 * 
 * // Use validated data
 * const validatedData = result.data;
 * ```
 */
export function validateRequest<T>(
  schema: ZodSchema<T>,
  body: unknown
): ValidationResult<T> {
  try {
    const validatedData = schema.parse(body);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof ZodError) {
      // Format Zod errors for client
      const formattedErrors = error.errors.map((err) => ({
        field: err.path.join(".") || "root",
        message: err.message,
        code: err.code,
      }));

      console.error("[Validation Error]", {
        errors: formattedErrors,
        receivedData: body,
      });

      // Create user-friendly error message
      const errorMessage = formattedErrors.length === 1
        ? `${formattedErrors[0].field}: ${formattedErrors[0].message}`
        : `Multiple validation errors: ${formattedErrors.map(e => `${e.field} (${e.message})`).join(', ')}`;

      return {
        success: false,
        response: NextResponse.json(
          {
            error: "Validation failed",
            message: errorMessage,
            details: formattedErrors,
          },
          { status: 400 }
        ),
      };
    }

    // Handle unexpected errors
    console.error("[Validation] Unexpected error:", error);
    return {
      success: false,
      response: NextResponse.json(
        {
          error: "Invalid request",
          message: "An unexpected error occurred during validation",
        },
        { status: 400 }
      ),
    };
  }
}

/**
 * Maps a service result errorCode to the correct HTTP status for internal routes.
 *
 * Internal routes share this mapping:
 *   NOT_FOUND  → 404
 *   FORBIDDEN  → 403
 *   anything else → 500
 *
 * @example
 * if (!result.success) {
 *   return serviceErrorResponse(result);
 * }
 */
export function serviceErrorResponse(
  result: { error?: string; errorCode?: string }
): NextResponse {
  const status =
    result.errorCode === "NOT_FOUND"
      ? 404
      : result.errorCode === "FORBIDDEN"
        ? 403
        : 500;
  return NextResponse.json(
    {
      error: result.error,
      message: result.error,
    },
    { status }
  );
}

/**
 * Async version of validateRequest for schemas with async refinements
 */
export async function validateRequestAsync<T>(
  schema: ZodSchema<T>,
  body: unknown
): Promise<ValidationResult<T>> {
  try {
    const validatedData = await schema.parseAsync(body);
    return { success: true, data: validatedData };
  } catch (error) {
    if (error instanceof ZodError) {
      const formattedErrors = error.errors.map((err) => ({
        field: err.path.join(".") || "root",
        message: err.message,
        code: err.code,
      }));

      console.error("[Validation Error]", {
        errors: formattedErrors,
        receivedData: body,
      });

      // Create user-friendly error message
      const errorMessage = formattedErrors.length === 1
        ? `${formattedErrors[0].field}: ${formattedErrors[0].message}`
        : `Multiple validation errors: ${formattedErrors.map(e => `${e.field} (${e.message})`).join(', ')}`;

      return {
        success: false,
        response: NextResponse.json(
          {
            error: "Validation failed",
            message: errorMessage,
            details: formattedErrors,
          },
          { status: 400 }
        ),
      };
    }

    console.error("[Validation] Unexpected error:", error);
    return {
      success: false,
      response: NextResponse.json(
        {
          error: "Invalid request",
          message: "An unexpected error occurred during validation",
        },
        { status: 400 }
      ),
    };
  }
}

/**
 * Validates and logs suspicious patterns
 * Useful for security monitoring
 */
export function validateAndLog<T>(
  schema: ZodSchema<T>,
  body: unknown,
  context: { userId?: string; endpoint: string }
): ValidationResult<T> {
  const result = validateRequest(schema, body);

  if (!result.success) {
    // Log failed validation attempt for security monitoring
    console.warn("[Security] Failed validation attempt:", {
      endpoint: context.endpoint,
      userId: context.userId,
      timestamp: new Date().toISOString(),
      payload: body,
    });
  }

  return result;
}
