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
    limit: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) return undefined;
        const n = Number.parseInt(value, 10);
        return Number.isNaN(n) ? undefined : n;
      })
      .refine((n) => n === undefined || (n >= 1 && n <= 100), {
        message: "limit must be between 1 and 100",
      }),
  })
  .openapi("DomainMarketplacePurchaseRequestListQuery");

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

export type AddDomainRequest = z.infer<typeof AddDomainRequestSchema>;
export type VerifyDomainRequest = z.infer<typeof VerifyDomainRequestSchema>;
export type SetPrimaryDomainRequest = z.infer<typeof SetPrimaryDomainRequestSchema>;
export type DomainListQuery = z.infer<typeof DomainListQuerySchema>;
