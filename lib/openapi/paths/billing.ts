import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "@/lib/openapi/init";
import { ErrorResponseSchema } from "@/lib/openapi/schemas/common";

// ──────────────────────────────────────────────────────────────────────────────
// Shared inline schemas (not large enough to warrant a separate schema file)
// ──────────────────────────────────────────────────────────────────────────────

const BalanceResponseSchema = z
  .object({
    data: z.object({
      credit_balance: z
        .number()
        .openapi({ description: "Total credit balance in USD cents", example: 5000 }),
      promo_credits: z
        .number()
        .openapi({ description: "Promotional credits portion (USD cents)", example: 1000 }),
      topup_credits: z
        .number()
        .openapi({ description: "Paid top-up credits portion (USD cents)", example: 4000 }),
    }),
  })
  .openapi("BillingBalanceResponse");

const TransactionSchema = z
  .object({
    id: z.string().uuid().openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    user_id: z.string().uuid(),
    amount: z.number().openapi({ description: "Transaction amount in USD cents", example: 1500 }),
    status: z.enum(["pending", "completed", "failed"]).openapi({ example: "completed" }),
    type: z
      .enum(["topup", "refund", "coupon", "recurring", "setup", "usage", "purchase"])
      .openapi({ example: "purchase" }),
    service_type: z
      .enum(["database", "kubernetes", "objectspace", "spectrum", "platform_apps", "domain"])
      .nullable()
      .openapi({ example: "domain" }),
    description: z.string().nullable().openapi({ example: "Domain renewal: example.com" }),
    balance_after: z.number().nullable().openapi({ example: 3500 }),
    metadata: z.record(z.unknown()).nullable(),
    created_at: z.string().datetime().openapi({ example: "2024-11-15T08:00:00.000Z" }),
  })
  .openapi("BillingTransaction");

const TransactionListResponseSchema = z
  .object({
    data: z.array(TransactionSchema),
    meta: z.object({
      page: z.number().int().openapi({ example: 1 }),
      limit: z.number().int().openapi({ example: 20 }),
      total: z.number().int().openapi({ example: 42 }),
      total_pages: z.number().int().openapi({ example: 3 }),
    }),
  })
  .openapi("BillingTransactionListResponse");

const TransactionListQuerySchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .openapi({ description: "Max records per page. Default 20, max 100.", example: 20 }),
    page: z
      .number()
      .int()
      .min(1)
      .optional()
      .openapi({ description: "1-based page number. Default 1.", example: 1 }),
    type: z
      .enum(["topup", "refund", "coupon", "recurring", "setup", "usage", "purchase"])
      .optional()
      .openapi({ description: "Filter by transaction type." }),
    service_type: z
      .enum(["database", "kubernetes", "objectspace", "spectrum", "platform_apps", "domain"])
      .optional()
      .openapi({ description: "Filter by service type." }),
    status: z
      .enum(["pending", "completed", "failed"])
      .optional()
      .openapi({ description: "Filter by transaction status." }),
    from: z
      .string()
      .optional()
      .openapi({ description: "ISO 8601 — return transactions created after this time.", example: "2024-01-01T00:00:00Z" }),
    to: z
      .string()
      .optional()
      .openapi({ description: "ISO 8601 — return transactions created before this time.", example: "2024-12-31T23:59:59Z" }),
  })
  .openapi("BillingTransactionListQuery");

// ──────────────────────────────────────────────────────────────────────────────
// Path registrations
// ──────────────────────────────────────────────────────────────────────────────

export function registerBillingPaths(registry: OpenAPIRegistry) {
  registry.registerPath({
    method: "get",
    path: "/api/v1/billing/balance",
    tags: ["Billing"],
    summary: "Get credit balance",
    description:
      "Returns the current credit balance for the authenticated user, split into top-up and promotional credit components.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Current balance",
        content: { "application/json": { schema: BalanceResponseSchema } },
      },
      401: {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      500: {
        description: "Internal error",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/billing/transactions",
    tags: ["Billing"],
    summary: "List billing transactions",
    description:
      "Returns paginated billing transaction history for the authenticated user. Supports filtering by type, service, status, and date range.",
    security: [{ bearerAuth: [] }],
    request: {
      query: TransactionListQuerySchema,
    },
    responses: {
      200: {
        description: "Transaction list",
        content: { "application/json": { schema: TransactionListResponseSchema } },
      },
      401: {
        description: "Unauthorized",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      403: {
        description: "Forbidden",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
      500: {
        description: "Internal error",
        content: { "application/json": { schema: ErrorResponseSchema } },
      },
    },
  });
}
