import { z } from "@/lib/openapi/init";

export const DomainStatusSchema = z
  .enum(["pending", "verified", "active", "failed", "removed"])
  .openapi("DomainStatus");

export const OperationStatusSchema = z
  .enum(["pending", "running", "succeeded", "failed"])
  .openapi("DomainOperationStatus");

export const DomainSchema = z
  .object({
    id: z.string().uuid().openapi({ example: "0bc8b49e-4107-4c8a-95ed-a3d86d08753d" }),
    app_id: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
    domain: z.string().openapi({ example: "api.example.com" }),
    status: DomainStatusSchema,
    verification_method: z.enum(["txt", "cname"]).openapi({ example: "txt" }),
    verification_token: z.string().openapi({ example: "verify_7f23cbb6500c31f7" }),
    verified_at: z.string().datetime().nullable().openapi({ example: null }),
    activated_at: z.string().datetime().nullable().openapi({ example: null }),
    ssl_status: z.enum(["pending", "issuing", "active", "failed"]).openapi({ example: "pending" }),
    is_primary: z.boolean().openapi({ example: false }),
    redirect_to_primary: z.boolean().openapi({ example: false }),
    last_error: z.string().nullable().openapi({ example: null }),
    last_check_at: z.string().datetime().nullable().openapi({ example: null }),
    created_at: z.string().datetime().openapi({ example: "2026-03-16T09:00:00Z" }),
    updated_at: z.string().datetime().openapi({ example: "2026-03-16T09:00:00Z" }),
  })
  .openapi("Domain");

export const DomainOperationSchema = z
  .object({
    id: z.string().uuid().openapi({ example: "f5aaf7d2-6b1b-403f-b6a7-f422f978f6f0" }),
    action: z.string().openapi({ example: "domain.activate" }),
    status: OperationStatusSchema,
    domain_id: z.string().uuid().nullable().openapi({ example: "0bc8b49e-4107-4c8a-95ed-a3d86d08753d" }),
    error_code: z.string().nullable().openapi({ example: null }),
    error_message: z.string().nullable().openapi({ example: null }),
    retryable: z.boolean().openapi({ example: false }),
    started_at: z.string().datetime().nullable().openapi({ example: "2026-03-16T09:02:00Z" }),
    finished_at: z.string().datetime().nullable().openapi({ example: null }),
    created_at: z.string().datetime().openapi({ example: "2026-03-16T09:01:59Z" }),
    updated_at: z.string().datetime().openapi({ example: "2026-03-16T09:02:00Z" }),
  })
  .openapi("DomainOperation");

export const VerificationInstructionSchema = z
  .object({
    record_type: z.literal("TXT").openapi({ example: "TXT" }),
    record_name: z.string().openapi({ example: "galaxyhvh-verify.api.example.com" }),
    record_value: z.string().openapi({ example: "verify_7f23cbb6500c31f7" }),
    ttl: z.number().openapi({ example: 300 }),
  })
  .openapi("DomainVerificationInstruction");

export const DomainListQuerySchema = z
  .object({
    app_id: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
  })
  .openapi("DomainListQuery");

export const DomainMarketplaceSearchRequestSchema = z
  .object({
    query: z.string().min(1).max(253).openapi({ example: "mybrand" }),
    tlds: z.array(z.string().min(2).max(20)).max(15).optional().openapi({ example: ["com", "io", "app"] }),
  })
  .openapi("DomainMarketplaceSearchRequest");

export const DomainMarketplacePurchaseRequestSchema = z
  .object({
    app_id: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
    domain: z.string().min(3).max(253).openapi({ example: "mybrand.com" }),
    idempotency_key: z.string().min(8).max(128).optional().openapi({ example: "idem-domain-001" }),
  })
  .openapi("DomainMarketplacePurchaseRequest");

export const DomainMarketplacePurchaseRequestListQuerySchema = z
  .object({
    app_id: z.string().uuid().optional().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
    limit: z.preprocess(
      (value) => {
        if (value === undefined || value === null || value === "") return undefined;
        if (typeof value === "string") {
          const trimmed = value.trim();
          if (!trimmed) return undefined;
          if (!/^\d+$/.test(trimmed)) return value;
          return Number.parseInt(trimmed, 10);
        }
        return value;
      },
      z
        .number({
          invalid_type_error: "limit must be a number",
        })
        .int("limit must be an integer")
        .min(1, "limit must be between 1 and 100")
        .max(100, "limit must be between 1 and 100")
        .optional()
    ),
  })
  .openapi("DomainMarketplacePurchaseRequestListQuery");

export const DomainMarketplaceSummarySchema = z
  .object({
    channel: z.literal("ahuracloud").openapi({ example: "ahuracloud" }),
    configured: z.boolean().openapi({ example: true }),
    mode: z.literal("managed_reseller").openapi({ example: "managed_reseller" }),
    capabilities: z.object({
      search: z.literal(true).openapi({ example: true }),
      purchase_requests: z.literal(true).openapi({ example: true }),
      auto_fulfillment: z.boolean().openapi({ example: true }),
    }),
    notes: z.string().openapi({
      example: "Domain purchases are completed through AhuraCloud using our registrar backend.",
    }),
  })
  .openapi("DomainMarketplaceSummary");

export const DomainMarketplaceResultSchema = z
  .object({
    domainName: z.string().openapi({ example: "mybrand.com" }),
    available: z.boolean().openapi({ example: true }),
    premium: z.boolean().openapi({ example: false }),
    purchasePrice: z.number().nullable().openapi({ example: 12.99 }),
    renewalPrice: z.number().nullable().openapi({ example: 14.99 }),
    currency: z.string().openapi({ example: "USD" }),
    purchaseType: z.string().nullable().openapi({ example: "registration" }),
    reason: z.string().nullable().openapi({ example: null }),
    fulfillment: z.literal("ahuracloud").openapi({ example: "ahuracloud" }),
  })
  .openapi("DomainMarketplaceResult");

export const DomainMarketplaceSearchDataSchema = z
  .object({
    channel: z.literal("ahuracloud").openapi({ example: "ahuracloud" }),
    query: z.string().openapi({ example: "mybrand" }),
    results: z.array(DomainMarketplaceResultSchema),
  })
  .openapi("DomainMarketplaceSearchData");

export const DomainPurchaseRequestStatusSchema = z
  .enum(["requested", "processing", "completed", "failed", "cancelled"])
  .openapi("DomainPurchaseRequestStatus");

export const DomainMarketplacePurchaseRequestRecordSchema = z
  .object({
    id: z.string().uuid().openapi({ example: "656bb6a3-9905-46d0-9704-b127cc296957" }),
    user_id: z.string().uuid().openapi({ example: "ccf391ef-271b-45e7-9799-3b1be3422363" }),
    app_id: z.string().uuid().openapi({ example: "00aefffd-e676-4ebe-b02e-9f936b1d04b4" }),
    domain: z.string().openapi({ example: "mybrand.com" }),
    status: DomainPurchaseRequestStatusSchema,
    purchase_price: z.number().nullable().openapi({ example: 12.99 }),
    renewal_price: z.number().nullable().openapi({ example: 14.99 }),
    currency: z.string().openapi({ example: "USD" }),
    provider: z.string().openapi({ example: "namecom" }),
    idempotency_key: z.string().nullable().openapi({ example: "idem-domain-001" }),
    provider_request_id: z.string().nullable().openapi({ example: "123456" }),
    last_error: z.string().nullable().openapi({ example: null }),
    metadata: z.record(z.unknown()).openapi({
      example: {
        purchase_type: "registration",
        premium: false,
        source: "dashboard-marketplace",
      },
    }),
    created_at: z.string().datetime().openapi({ example: "2026-03-16T14:12:20.000Z" }),
    updated_at: z.string().datetime().openapi({ example: "2026-03-16T14:12:21.000Z" }),
  })
  .openapi("DomainMarketplacePurchaseRequestRecord");

export const AddDomainRequestSchema = z
  .object({
    app_id: z.string().uuid().openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
    domain: z.string().min(3).max(253).openapi({ example: "api.example.com" }),
  })
  .openapi("AddDomainRequest");

export const VerifyDomainRequestSchema = z
  .object({
    force_refresh: z.boolean().optional().openapi({ example: true }),
  })
  .openapi("VerifyDomainRequest");

export const SetPrimaryDomainRequestSchema = z
  .object({
    redirect_to_primary: z.boolean().optional().openapi({ example: false }),
  })
  .openapi("SetPrimaryDomainRequest");

export const DomainListResponseSchema = z
  .object({
    data: z.array(DomainSchema),
    meta: z.object({ total: z.number().openapi({ example: 2 }) }).optional(),
  })
  .openapi("DomainListResponse");

export const DomainResponseSchema = z
  .object({
    data: DomainSchema,
  })
  .openapi("DomainResponse");

export const AddDomainResponseSchema = z
  .object({
    data: z.object({
      domain: DomainSchema,
      verification_instructions: VerificationInstructionSchema,
    }),
  })
  .openapi("AddDomainResponse");

export const ActivationQueuedResponseSchema = z
  .object({
    data: z.object({
      operation_id: z.string().uuid().openapi({ example: "f5aaf7d2-6b1b-403f-b6a7-f422f978f6f0" }),
      status: z.literal("pending").openapi({ example: "pending" }),
    }),
  })
  .openapi("DomainActivationQueuedResponse");

export const DomainOperationResponseSchema = z
  .object({
    data: DomainOperationSchema,
  })
  .openapi("DomainOperationResponse");

export const DomainMarketplaceSummaryResponseSchema = z
  .object({
    data: DomainMarketplaceSummarySchema,
  })
  .openapi("DomainMarketplaceSummaryResponse");

export const DomainMarketplaceProvidersResponseSchema = z
  .object({
    data: DomainMarketplaceSummarySchema,
    deprecated: z.literal(true).openapi({ example: true }),
    message: z.string().openapi({
      example: "Use /api/v1/domains/market/summary for reseller metadata.",
    }),
  })
  .openapi("DomainMarketplaceProvidersResponse");

export const DomainMarketplaceSearchResponseSchema = z
  .object({
    data: DomainMarketplaceSearchDataSchema,
  })
  .openapi("DomainMarketplaceSearchResponse");

export const DomainMarketplacePurchaseRequestResponseSchema = z
  .object({
    data: DomainMarketplacePurchaseRequestRecordSchema,
  })
  .openapi("DomainMarketplacePurchaseRequestResponse");

export const DomainMarketplacePurchaseRequestListResponseSchema = z
  .object({
    data: z.array(DomainMarketplacePurchaseRequestRecordSchema),
    meta: z.object({
      total: z.number().openapi({ example: 1 }),
    }),
  })
  .openapi("DomainMarketplacePurchaseRequestListResponse");

export type AddDomainRequest = z.infer<typeof AddDomainRequestSchema>;
export type VerifyDomainRequest = z.infer<typeof VerifyDomainRequestSchema>;
export type SetPrimaryDomainRequest = z.infer<typeof SetPrimaryDomainRequestSchema>;
export type DomainListQuery = z.infer<typeof DomainListQuerySchema>;
