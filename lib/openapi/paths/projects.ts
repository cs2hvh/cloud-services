import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "@/lib/openapi/init";

import { ErrorResponseSchema, ValidationErrorResponseSchema } from "@/lib/openapi/schemas/common";
import {
  CreateProjectRequestSchema,
  ProjectDeleteResponseSchema,
  ProjectListResponseSchema,
  ProjectResponseSchema,
  UpdateProjectRequestSchema,
} from "@/lib/openapi/schemas/projects";

export function registerProjectPaths(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
    path: "/api/v1/projects",
    tags: ["Projects"],
    summary: "List projects",
    description: "Returns all projects where the authenticated user is owner or member.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "List of projects",
        content: {
          "application/json": {
            schema: ProjectListResponseSchema,
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
            example: { error: "RATE_LIMIT_EXCEEDED", message: "Too many requests. Please try again later.", details: { retry_after: 58 } },
          },
        },
      },
      500: {
        description: "Fetch failed",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "INTERNAL_ERROR", message: "Failed to fetch projects" },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/projects",
    tags: ["Projects"],
    summary: "Create project",
    description: "Creates a new project owned by the authenticated user.",
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: CreateProjectRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: "Project created",
        content: {
          "application/json": {
            schema: ProjectResponseSchema,
          },
        },
      },
      400: {
        description: "Validation error",
        content: {
          "application/json": {
            schema: ValidationErrorResponseSchema,
            example: {
              error: "VALIDATION_ERROR",
              message: "Invalid request body",
              validation_errors: [{ path: "name", message: "Name is required" }],
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
      409: {
        description: "Already exists",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "ALREADY_EXISTS", message: "Project already exists" },
          },
        },
      },
      429: {
        description: "Too many requests",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "RATE_LIMIT_EXCEEDED", message: "Too many requests. Please try again later.", details: { retry_after: 58 } },
          },
        },
      },
      500: {
        description: "Create failed",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "CREATE_FAILED", message: "Failed to create project" },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/projects/{id}",
    tags: ["Projects"],
    summary: "Get project",
    description: "Returns one project by ID.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        id: z.string().uuid().openapi({ example: "77ef5894-cc88-468d-98f4-6e861c24be86" }),
      }),
    },
    responses: {
      200: {
        description: "Project details",
        content: {
          "application/json": {
            schema: ProjectResponseSchema,
          },
        },
      },
      400: {
        description: "Invalid ID",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "INVALID_ID", message: "Invalid id format", details: { field: "id" } },
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
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "FORBIDDEN", message: "You do not have permission to access this project" },
          },
        },
      },
      404: {
        description: "Project not found",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "NOT_FOUND", message: "Project not found" },
          },
        },
      },
      429: {
        description: "Too many requests",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "RATE_LIMIT_EXCEEDED", message: "Too many requests. Please try again later.", details: { retry_after: 58 } },
          },
        },
      },
      500: {
        description: "Fetch failed",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "INTERNAL_ERROR", message: "Failed to fetch project" },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "patch",
    path: "/api/v1/projects/{id}",
    tags: ["Projects"],
    summary: "Update project",
    description: "Updates project metadata. Only project owner can modify.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        id: z.string().uuid().openapi({ example: "77ef5894-cc88-468d-98f4-6e861c24be86" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: UpdateProjectRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "Project updated",
        content: {
          "application/json": {
            schema: ProjectResponseSchema,
          },
        },
      },
      400: {
        description: "Validation error or invalid ID",
        content: {
          "application/json": {
            schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]),
            examples: {
              invalid_body: {
                summary: "Invalid body",
                value: {
                  error: "VALIDATION_ERROR",
                  message: "Invalid request body",
                  validation_errors: [{ path: "name", message: "At least one field must be provided" }],
                },
              },
              invalid_id: {
                summary: "Invalid ID",
                value: { error: "INVALID_ID", message: "Invalid id format", details: { field: "id" } },
              },
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
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "FORBIDDEN", message: "You do not have permission to modify this project" },
          },
        },
      },
      404: {
        description: "Project not found",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "NOT_FOUND", message: "Project not found" },
          },
        },
      },
      429: {
        description: "Too many requests",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "RATE_LIMIT_EXCEEDED", message: "Too many requests. Please try again later.", details: { retry_after: 58 } },
          },
        },
      },
      500: {
        description: "Update failed",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "UPDATE_FAILED", message: "Failed to update project" },
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/v1/projects/{id}",
    tags: ["Projects"],
    summary: "Delete project",
    description: "Deletes a project. Only project owner can delete.",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        id: z.string().uuid().openapi({ example: "77ef5894-cc88-468d-98f4-6e861c24be86" }),
      }),
    },
    responses: {
      200: {
        description: "Project deleted",
        content: {
          "application/json": {
            schema: ProjectDeleteResponseSchema,
          },
        },
      },
      400: {
        description: "Invalid ID",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "INVALID_ID", message: "Invalid id format", details: { field: "id" } },
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
      403: {
        description: "Forbidden",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "FORBIDDEN", message: "You do not have permission to delete this project" },
          },
        },
      },
      404: {
        description: "Project not found",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "NOT_FOUND", message: "Project not found" },
          },
        },
      },
      429: {
        description: "Too many requests",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "RATE_LIMIT_EXCEEDED", message: "Too many requests. Please try again later.", details: { retry_after: 58 } },
          },
        },
      },
      500: {
        description: "Delete failed",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: { error: "DELETE_FAILED", message: "Failed to delete project" },
          },
        },
      },
    },
  });
}
