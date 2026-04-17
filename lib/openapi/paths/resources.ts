import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "@/lib/openapi/init";

import { ErrorResponseSchema } from "@/lib/openapi/schemas/common";
import { ResourcePlanListResponseSchema, ResourceTypeSchema } from "@/lib/openapi/schemas/resources";

export function registerResourcePaths(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
    path: "/api/v1/resources",
    tags: ["Resources"],
    summary: "List resource plans",
    description:
      "Returns available resource plans with minimal fields only: plan_id, name, description, type, and sub_type.",
    security: [{ bearerAuth: [] }],
    request: {
      query: z.object({
        type: ResourceTypeSchema.optional().openapi({
          description: "Optional resource type filter.",
          example: "database",
        }),
      }),
    },
    responses: {
      200: {
        description: "List of resource plans",
        content: {
          "application/json": {
            schema: ResourcePlanListResponseSchema,
          },
        },
      },
      400: {
        description: "Invalid query parameter",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: {
              error: "INVALID_PARAMETER",
              message: "Invalid resource type",
              details: { field: "type" },
            },
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "UNAUTHORIZED", message: "Missing or invalid API key" },
          },
        },
      },
      429: {
        description: "Too many requests",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: {
              error: "RATE_LIMIT_EXCEEDED",
              message: "Too many requests. Please try again later.",
              details: { retry_after: 58 },
            },
          },
        },
      },
      500: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "INTERNAL_ERROR", message: "Failed to fetch resources" },
          },
        },
      },
    },
  });
}

