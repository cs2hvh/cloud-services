/**
 * V1 API OpenAPI Error Response Templates
 * Simple reusable error responses for OpenAPI registration
 */
import { z } from "zod";

/**
 * Standard error response schema (matches v1Error format)
 */
export const ErrorResponseSchema = z.object({
  error: z.string().describe("Machine-readable error code"),
  message: z.string().describe("Human-readable error message"),
  details: z.record(z.unknown()).optional().describe("Additional error details"),
});

/**
 * Standard validation error response schema (matches v1ValidationError format)
 */
export const ValidationErrorResponseSchema = z.object({
  error: z.literal("VALIDATION_ERROR"),
  message: z.string(),
  validation_errors: z.array(
    z.object({
      path: z.string().describe("Field path that failed validation"),
      message: z.string().describe("Validation error message"),
    })
  ),
});

/**
 * Pre-built error response templates for OpenAPI
 * Use these in your endpoint's responses section
 */
export const OPENAPI_ERROR_RESPONSES = {
  400: {
    description: "Bad Request - Invalid input",
    content: {
      "application/json": {
        schema: ValidationErrorResponseSchema,
        examples: {
          validationError: {
            summary: "Validation error",
            value: {
              error: "VALIDATION_ERROR",
              message: "Invalid request body",
              validation_errors: [
                { path: "name", message: "Name is required" },
                { path: "email", message: "Invalid email format" },
              ],
            },
          },
          invalidId: {
            summary: "Invalid ID format",
            value: {
              error: "INVALID_ID",
              message: "Invalid ID format",
              details: { field: "id" },
            },
          },
        },
      },
    },
  },

  401: {
    description: "Unauthorized - Missing or invalid API key",
    content: {
      "application/json": {
        schema: ErrorResponseSchema,
        example: {
          error: "UNAUTHORIZED",
          message: "Missing or invalid API key",
        },
      },
    },
  },

  403: {
    description: "Forbidden - Insufficient permissions",
    content: {
      "application/json": {
        schema: ErrorResponseSchema,
        example: {
          error: "FORBIDDEN",
          message: "You do not have permission to access this resource",
        },
      },
    },
  },

  404: {
    description: "Not Found - Resource does not exist",
    content: {
      "application/json": {
        schema: ErrorResponseSchema,
        example: {
          error: "NOT_FOUND",
          message: "Resource not found",
        },
      },
    },
  },

  409: {
    description: "Conflict - Resource already exists",
    content: {
      "application/json": {
        schema: ErrorResponseSchema,
        example: {
          error: "ALREADY_EXISTS",
          message: "Resource already exists",
        },
      },
    },
  },

  429: {
    description: "Too Many Requests - Rate limit exceeded",
    content: {
      "application/json": {
        schema: ErrorResponseSchema,
        example: {
          error: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please try again later.",
        },
      },
    },
  },

  500: {
    description: "Internal Server Error",
    content: {
      "application/json": {
        schema: ErrorResponseSchema,
        examples: {
          generic: {
            summary: "Generic server error",
            value: {
              error: "INTERNAL_ERROR",
              message: "Internal server error",
            },
          },
          createFailed: {
            summary: "Create operation failed",
            value: {
              error: "CREATE_FAILED",
              message: "Failed to create resource",
            },
          },
          updateFailed: {
            summary: "Update operation failed",
            value: {
              error: "UPDATE_FAILED",
              message: "Failed to update resource",
            },
          },
          deleteFailed: {
            summary: "Delete operation failed",
            value: {
              error: "DELETE_FAILED",
              message: "Failed to delete resource",
            },
          },
        },
      },
    },
  },
};
