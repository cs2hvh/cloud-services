import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

import { ErrorResponseSchema, ValidationErrorResponseSchema } from "@/lib/openapi/schemas/common";
import {
  GpuInventoryListResponseSchema,
  GpuPodCreateRequestSchema,
  GpuPodCreatedResponseSchema,
  GpuPodDeleteResponseSchema,
  GpuPodListResponseSchema,
  GpuPodPowerRequestSchema,
  GpuPodPowerResponseSchema,
  GpuPodResponseSchema,
  GpuTemplateListResponseSchema,
  GpuVolumeCreateRequestSchema,
  GpuVolumeDeleteResponseSchema,
  GpuVolumeListResponseSchema,
  GpuVolumeResponseSchema,
} from "@/lib/openapi/schemas/gpu";

const security = [{ bearerAuth: [] }];
const error = (description: string, code: string, message: string) => ({
  description,
  content: {
    "application/json": {
      schema: ErrorResponseSchema,
      example: { error: code, message },
    },
  },
});

const commonErrors = {
  401: error("Unauthorized", "UNAUTHORIZED", "Missing or invalid API key"),
  429: error("Rate limit exceeded", "RATE_LIMIT_EXCEEDED", "Too many requests. Please try again later."),
  500: error("Internal server error", "INTERNAL_ERROR", "Internal server error"),
};

const idParameter = (resource: string) => ({
  name: "id",
  in: "path" as const,
  required: true,
  schema: { type: "integer" as const, minimum: 1, example: 42 },
  description: `Internal platform ${resource} ID.`,
});

export function registerGpuPaths(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
    path: "/api/v1/gpu/inventory",
    tags: ["GPU Cloud"],
    summary: "List GPU inventory",
    operationId: "listGpuInventory",
    security,
    description: "Returns current secure-cloud availability and customer resale pricing. Upstream provider identifiers and wholesale prices are not exposed.",
    responses: {
      200: {
        description: "GPU inventory",
        content: { "application/json": { schema: GpuInventoryListResponseSchema } },
      },
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/gpu/templates",
    tags: ["GPU Cloud"],
    summary: "List GPU pod templates",
    operationId: "listGpuTemplates",
    security,
    responses: {
      200: {
        description: "GPU pod templates",
        content: { "application/json": { schema: GpuTemplateListResponseSchema } },
      },
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/gpu/pods",
    tags: ["GPU Cloud"],
    summary: "List active GPU pods",
    operationId: "listGpuPods",
    security,
    description: "Returns non-terminated pods owned by the authenticated user.",
    responses: {
      200: {
        description: "GPU pods",
        content: { "application/json": { schema: GpuPodListResponseSchema } },
      },
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/gpu/pods",
    tags: ["GPU Cloud"],
    summary: "Create GPU pod",
    operationId: "createGpuPod",
    security,
    parameters: [{
      name: "Idempotency-Key",
      in: "header",
      required: false,
      schema: { type: "string" as const },
      description: "Unique client key used to prevent duplicate provisioning.",
    }],
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: GpuPodCreateRequestSchema } },
      },
    },
    responses: {
      201: {
        description: "GPU pod created",
        content: { "application/json": { schema: GpuPodCreatedResponseSchema } },
      },
      400: {
        description: "Validation error",
        content: { "application/json": { schema: ValidationErrorResponseSchema } },
      },
      402: error("Insufficient balance", "INSUFFICIENT_BALANCE", "Insufficient credits"),
      409: error("Capacity unavailable or duplicate request", "CAPACITY_UNAVAILABLE", "GPU capacity is unavailable"),
      504: error("Provider timeout", "GATEWAY_TIMEOUT", "GPU provider request timed out"),
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/gpu/pods/{id}",
    tags: ["GPU Cloud"],
    summary: "Get GPU pod",
    operationId: "getGpuPod",
    security,
    parameters: [idParameter("pod")],
    responses: {
      200: {
        description: "GPU pod",
        content: { "application/json": { schema: GpuPodResponseSchema } },
      },
      400: error("Invalid ID", "INVALID_ID", "Invalid pod ID format"),
      403: error("Forbidden", "FORBIDDEN", "You do not have permission to access this pod"),
      404: error("Not found", "NOT_FOUND", "GPU pod not found"),
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/v1/gpu/pods/{id}",
    tags: ["GPU Cloud"],
    summary: "Terminate GPU pod",
    operationId: "deleteGpuPod",
    security,
    parameters: [idParameter("pod")],
    responses: {
      200: {
        description: "GPU pod terminated",
        content: { "application/json": { schema: GpuPodDeleteResponseSchema } },
      },
      400: error("Invalid ID or state", "INVALID_ID", "Invalid pod ID format"),
      403: error("Forbidden", "FORBIDDEN", "You do not have permission to delete this pod"),
      404: error("Not found", "NOT_FOUND", "GPU pod not found"),
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/gpu/pods/{id}/power",
    tags: ["GPU Cloud"],
    summary: "Start, stop, or restart GPU pod",
    operationId: "powerGpuPod",
    security,
    parameters: [idParameter("pod")],
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: GpuPodPowerRequestSchema } },
      },
    },
    responses: {
      200: {
        description: "Power action accepted",
        content: { "application/json": { schema: GpuPodPowerResponseSchema } },
      },
      400: {
        description: "Validation error",
        content: { "application/json": { schema: ValidationErrorResponseSchema } },
      },
      403: error("Forbidden", "FORBIDDEN", "You do not have permission to modify this pod"),
      404: error("Not found", "NOT_FOUND", "GPU pod not found"),
      504: error("Provider timeout", "GATEWAY_TIMEOUT", "GPU provider request timed out"),
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/gpu/volumes",
    tags: ["GPU Cloud"],
    summary: "List network volumes",
    operationId: "listGpuVolumes",
    security,
    description: "Returns non-deleted volumes owned by the authenticated user.",
    responses: {
      200: {
        description: "Network volumes",
        content: { "application/json": { schema: GpuVolumeListResponseSchema } },
      },
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/gpu/volumes",
    tags: ["GPU Cloud"],
    summary: "Create network volume",
    operationId: "createGpuVolume",
    security,
    parameters: [{
      name: "Idempotency-Key",
      in: "header",
      required: false,
      schema: { type: "string" as const },
      description: "Unique client key used to prevent duplicate provisioning.",
    }],
    request: {
      body: {
        required: true,
        content: { "application/json": { schema: GpuVolumeCreateRequestSchema } },
      },
    },
    responses: {
      201: {
        description: "Network volume created",
        content: { "application/json": { schema: GpuVolumeResponseSchema } },
      },
      400: {
        description: "Validation error",
        content: { "application/json": { schema: ValidationErrorResponseSchema } },
      },
      402: error("Insufficient balance", "INSUFFICIENT_BALANCE", "Insufficient credits"),
      409: error("Duplicate request", "REQUEST_IN_PROGRESS", "This request is already being processed"),
      504: error("Provider timeout", "GATEWAY_TIMEOUT", "GPU provider request timed out"),
      ...commonErrors,
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/v1/gpu/volumes/{id}",
    tags: ["GPU Cloud"],
    summary: "Delete network volume",
    operationId: "deleteGpuVolume",
    security,
    parameters: [idParameter("volume")],
    responses: {
      200: {
        description: "Network volume deleted",
        content: { "application/json": { schema: GpuVolumeDeleteResponseSchema } },
      },
      400: error("Invalid ID", "INVALID_ID", "Invalid volume ID format"),
      409: error("Volume attached", "CAPACITY_UNAVAILABLE", "Volume is attached to a running pod"),
      403: error("Forbidden", "FORBIDDEN", "You do not have permission to delete this volume"),
      404: error("Not found", "NOT_FOUND", "Network volume not found"),
      ...commonErrors,
    },
  });

}
