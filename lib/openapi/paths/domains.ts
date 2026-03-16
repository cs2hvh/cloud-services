import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "@/lib/openapi/init";
import { ErrorResponseSchema, ValidationErrorResponseSchema } from "@/lib/openapi/schemas/common";
import {
  ActivationQueuedResponseSchema,
  AddDomainRequestSchema,
  AddDomainResponseSchema,
  DomainListQuerySchema,
  DomainListResponseSchema,
  DomainOperationResponseSchema,
  DomainResponseSchema,
  SetPrimaryDomainRequestSchema,
  VerifyDomainRequestSchema,
} from "@/lib/domain-service/contracts/schemas";

const IdempotencyHeaderSchema = z
  .object({
    "idempotency-key": z
      .string()
      .min(8)
      .max(128)
      .optional()
      .openapi({ example: "req_01hxy89q5xwq7v3j" }),
  })
  .openapi("DomainIdempotencyHeader");

export function registerDomainPaths(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
    path: "/api/v1/domains",
    tags: ["Domains"],
    summary: "List domains by app",
    security: [{ bearerAuth: [] }],
    request: {
      query: DomainListQuerySchema,
    },
    responses: {
      200: {
        description: "Domain list",
        content: { "application/json": { schema: DomainListResponseSchema } },
      },
      400: {
        description: "Invalid query",
        content: { "application/json": { schema: ValidationErrorResponseSchema } },
      },
      401: {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      404: {
        description: "App not found",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      500: {
        description: "Internal error",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/domains",
    tags: ["Domains"],
    summary: "Add custom domain",
    security: [{ bearerAuth: [] }],
    request: {
      headers: IdempotencyHeaderSchema,
      body: {
        content: {
          "application/json": {
            schema: AddDomainRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: "Domain added",
        content: { "application/json": { schema: AddDomainResponseSchema } },
      },
      400: {
        description: "Validation error",
        content: {
          "application/json": {
            schema: z.union([ValidationErrorResponseSchema, ErrorResponseSchema]),
          },
        },
      },
      401: {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      409: {
        description: "Domain already in use",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      500: {
        description: "Internal error",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/domains/{id}/verify",
    tags: ["Domains"],
    summary: "Verify domain ownership",
    security: [{ bearerAuth: [] }],
    request: {
      headers: IdempotencyHeaderSchema,
      params: z.object({ id: z.string().uuid().openapi({ example: "0bc8b49e-4107-4c8a-95ed-a3d86d08753d" }) }),
      body: {
        content: {
          "application/json": {
            schema: VerifyDomainRequestSchema,
          },
        },
      },
    },
    responses: {
      200: { description: "Domain verified", content: { "application/json": { schema: DomainResponseSchema } } },
      400: { description: "Validation/verification failed", content: { "application/json": { schema: ErrorResponseSchema } } },
      401: { description: "Unauthorized", content: { "application/json": { schema: ErrorResponseSchema } } },
      403: { description: "Forbidden", content: { "application/json": { schema: ErrorResponseSchema } } },
      404: { description: "Domain not found", content: { "application/json": { schema: ErrorResponseSchema } } },
      500: { description: "Internal error", content: { "application/json": { schema: ErrorResponseSchema } } },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/domains/{id}/activate",
    tags: ["Domains"],
    summary: "Activate verified domain",
    description: "Queues DNS + ingress reconciliation and returns operation id.",
    security: [{ bearerAuth: [] }],
    request: {
      headers: IdempotencyHeaderSchema,
      params: z.object({ id: z.string().uuid().openapi({ example: "0bc8b49e-4107-4c8a-95ed-a3d86d08753d" }) }),
    },
    responses: {
      202: {
        description: "Activation queued",
        content: { "application/json": { schema: ActivationQueuedResponseSchema } },
      },
      400: { description: "Domain not eligible", content: { "application/json": { schema: ErrorResponseSchema } } },
      401: { description: "Unauthorized", content: { "application/json": { schema: ErrorResponseSchema } } },
      403: { description: "Forbidden", content: { "application/json": { schema: ErrorResponseSchema } } },
      404: { description: "Domain not found", content: { "application/json": { schema: ErrorResponseSchema } } },
      409: { description: "Operation already running", content: { "application/json": { schema: ErrorResponseSchema } } },
      500: { description: "Internal error", content: { "application/json": { schema: ErrorResponseSchema } } },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/domains/{id}/set-primary",
    tags: ["Domains"],
    summary: "Set primary domain",
    security: [{ bearerAuth: [] }],
    request: {
      headers: IdempotencyHeaderSchema,
      params: z.object({ id: z.string().uuid().openapi({ example: "0bc8b49e-4107-4c8a-95ed-a3d86d08753d" }) }),
      body: {
        content: {
          "application/json": {
            schema: SetPrimaryDomainRequestSchema,
          },
        },
      },
    },
    responses: {
      200: { description: "Primary domain updated", content: { "application/json": { schema: DomainResponseSchema } } },
      400: { description: "Domain not active", content: { "application/json": { schema: ErrorResponseSchema } } },
      401: { description: "Unauthorized", content: { "application/json": { schema: ErrorResponseSchema } } },
      403: { description: "Forbidden", content: { "application/json": { schema: ErrorResponseSchema } } },
      404: { description: "Domain not found", content: { "application/json": { schema: ErrorResponseSchema } } },
      500: { description: "Internal error", content: { "application/json": { schema: ErrorResponseSchema } } },
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/v1/domains/{id}",
    tags: ["Domains"],
    summary: "Remove domain",
    security: [{ bearerAuth: [] }],
    request: {
      headers: IdempotencyHeaderSchema,
      params: z.object({ id: z.string().uuid().openapi({ example: "0bc8b49e-4107-4c8a-95ed-a3d86d08753d" }) }),
    },
    responses: {
      200: {
        description: "Domain removed",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                deleted: z.literal(true),
                domain_id: z.string().uuid(),
              }),
            }),
          },
        },
      },
      401: { description: "Unauthorized", content: { "application/json": { schema: ErrorResponseSchema } } },
      403: { description: "Forbidden", content: { "application/json": { schema: ErrorResponseSchema } } },
      404: { description: "Domain not found", content: { "application/json": { schema: ErrorResponseSchema } } },
      500: { description: "Internal error", content: { "application/json": { schema: ErrorResponseSchema } } },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/domain-operations/{operationId}",
    tags: ["Domains"],
    summary: "Get operation status",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        operationId: z.string().uuid().openapi({ example: "f5aaf7d2-6b1b-403f-b6a7-f422f978f6f0" }),
      }),
    },
    responses: {
      200: {
        description: "Operation status",
        content: { "application/json": { schema: DomainOperationResponseSchema } },
      },
      401: { description: "Unauthorized", content: { "application/json": { schema: ErrorResponseSchema } } },
      403: { description: "Forbidden", content: { "application/json": { schema: ErrorResponseSchema } } },
      404: { description: "Operation not found", content: { "application/json": { schema: ErrorResponseSchema } } },
      500: { description: "Internal error", content: { "application/json": { schema: ErrorResponseSchema } } },
    },
  });
}
