import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "@/lib/openapi/init";
import { ErrorResponseSchema, ValidationErrorResponseSchema } from "@/lib/openapi/schemas/common";
import {
  ActivationQueuedResponseSchema,
  AddDomainRequestSchema,
  AddDomainResponseSchema,
  DomainListQuerySchema,
  DomainMarketplaceProvidersResponseSchema,
  DomainMarketplacePurchaseRequestListResponseSchema,
  DomainMarketplacePurchaseRequestResponseSchema,
  DomainMarketplacePurchaseRequestSchema,
  DomainMarketplaceSearchRequestSchema,
  DomainMarketplaceSearchResponseSchema,
  DomainMarketplaceSummaryResponseSchema,
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

const DomainMarketplacePurchaseRequestIdParamSchema = z
  .object({
    requestId: z.string().uuid().openapi({ example: "656bb6a3-9905-46d0-9704-b127cc296957" }),
  })
  .openapi("DomainMarketplacePurchaseRequestIdParam");

const DomainMarketplacePurchaseRequestListOpenApiQuerySchema = z
  .object({
    app_id: z.string().uuid().optional().openapi({ example: "00aefffd-e676-4ebe-b02e-9f936b1d04b4" }),
    limit: z.number().int().min(1).max(100).optional().openapi({ example: 20 }),
  })
  .openapi("DomainMarketplacePurchaseRequestListOpenApiQuery");

const V1RateLimitErrorExample = {
  error: "RATE_LIMIT_EXCEEDED",
  message: "Too many requests. Please try again later.",
  details: { retry_after: 58 },
};

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

  registry.registerPath({
    method: "get",
    path: "/api/v1/domains/market/summary",
    tags: ["Domain Marketplace"],
    summary: "Get domain marketplace summary",
    description: "Returns marketplace channel and capabilities.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Marketplace summary",
        content: { "application/json": { schema: DomainMarketplaceSummaryResponseSchema } },
      },
      401: {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      402: {
        description: "Provider account action required",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      429: {
        description: "Too many requests",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: V1RateLimitErrorExample,
          },
        },
      },
      500: {
        description: "Internal error",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      502: {
        description: "Registrar upstream error",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/domains/market/providers",
    tags: ["Domain Marketplace"],
    summary: "Get domain marketplace provider metadata",
    description: "Legacy compatibility endpoint that mirrors marketplace summary data.",
    deprecated: true,
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Provider metadata",
        content: { "application/json": { schema: DomainMarketplaceProvidersResponseSchema } },
      },
      401: {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      429: {
        description: "Too many requests",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: V1RateLimitErrorExample,
          },
        },
      },
      500: {
        description: "Internal error",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/domains/market/search",
    tags: ["Domain Marketplace"],
    summary: "Search purchasable domains",
    description: "Searches registrar-backed domain availability and pricing.",
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: DomainMarketplaceSearchRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: "Search results",
        content: { "application/json": { schema: DomainMarketplaceSearchResponseSchema } },
      },
      400: {
        description: "Invalid search payload or validation error",
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
      429: {
        description: "Too many requests",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: V1RateLimitErrorExample,
          },
        },
      },
      500: {
        description: "Internal error",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/domains/market/purchase-requests",
    tags: ["Domain Marketplace"],
    summary: "List domain purchase requests",
    description: "Lists purchase requests for the authenticated API user, optionally filtered by app.",
    security: [{ bearerAuth: [] }],
    request: {
      query: DomainMarketplacePurchaseRequestListOpenApiQuerySchema,
    },
    responses: {
      200: {
        description: "Purchase request list",
        content: { "application/json": { schema: DomainMarketplacePurchaseRequestListResponseSchema } },
      },
      400: {
        description: "Invalid query parameters",
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
        description: "Forbidden for this app",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      404: {
        description: "App not found",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      429: {
        description: "Too many requests",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: V1RateLimitErrorExample,
          },
        },
      },
      500: {
        description: "Internal error",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/domains/market/purchase-requests",
    tags: ["Domain Marketplace"],
    summary: "Create domain purchase request",
    description: "Creates or reuses an idempotent purchase request and attempts registrar fulfillment.",
    security: [{ bearerAuth: [] }],
    request: {
      headers: IdempotencyHeaderSchema,
      body: {
        content: {
          "application/json": {
            schema: DomainMarketplacePurchaseRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: "Purchase request created or idempotently reused",
        content: { "application/json": { schema: DomainMarketplacePurchaseRequestResponseSchema } },
      },
      400: {
        description: "Invalid payload or domain validation error",
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
      402: {
        description: "Insufficient credits or provider payment required",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      403: {
        description: "Forbidden for this app",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      404: {
        description: "App not found",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      409: {
        description: "Domain unavailable or purchase conflict",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      429: {
        description: "Too many requests",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: V1RateLimitErrorExample,
          },
        },
      },
      500: {
        description: "Internal error",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      502: {
        description: "Registrar or billing upstream error",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/domains/market/purchase-requests/{requestId}",
    tags: ["Domain Marketplace"],
    summary: "Get purchase request by id",
    description: "Returns a single purchase request for the authenticated API user.",
    security: [{ bearerAuth: [] }],
    request: {
      params: DomainMarketplacePurchaseRequestIdParamSchema,
    },
    responses: {
      200: {
        description: "Purchase request",
        content: { "application/json": { schema: DomainMarketplacePurchaseRequestResponseSchema } },
      },
      400: {
        description: "Invalid request id",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      401: {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      404: {
        description: "Purchase request not found",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      429: {
        description: "Too many requests",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: V1RateLimitErrorExample,
          },
        },
      },
      500: {
        description: "Internal error",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/v1/domains/market/checkout",
    tags: ["Domain Marketplace"],
    summary: "Checkout domain purchase",
    description: "Compatibility checkout endpoint that delegates to the purchase request flow.",
    security: [{ bearerAuth: [] }],
    request: {
      headers: IdempotencyHeaderSchema,
      body: {
        content: {
          "application/json": {
            schema: DomainMarketplacePurchaseRequestSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: "Checkout purchase request created",
        content: { "application/json": { schema: DomainMarketplacePurchaseRequestResponseSchema } },
      },
      400: {
        description: "Invalid payload or domain validation error",
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
      402: {
        description: "Insufficient credits or provider payment required",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      403: {
        description: "Forbidden for this app",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      404: {
        description: "App not found",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      409: {
        description: "Domain unavailable or purchase conflict",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      429: {
        description: "Too many requests",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
            example: V1RateLimitErrorExample,
          },
        },
      },
      500: {
        description: "Internal error",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      502: {
        description: "Registrar or billing upstream error",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
    },
  });
}
