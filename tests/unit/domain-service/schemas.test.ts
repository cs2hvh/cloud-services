import { describe, it, expect } from "vitest";
import {
  AddDomainRequestSchema,
  DomainMarketplacePurchaseRequestListQuerySchema,
  DomainListQuerySchema,
} from "@/lib/domain-service/contracts/schemas";

describe("domain contracts", () => {
  it("validates add domain request", () => {
    const parsed = AddDomainRequestSchema.safeParse({
      app_id: "550e8400-e29b-41d4-a716-446655440000",
      domain: "api.example.com",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects invalid app id in query", () => {
    const parsed = DomainListQuerySchema.safeParse({ app_id: "not-a-uuid" });
    expect(parsed.success).toBe(false);
  });

  it("validates marketplace purchase request list query limit", () => {
    const valid = DomainMarketplacePurchaseRequestListQuerySchema.safeParse({ limit: "20" });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.limit).toBe(20);
    }

    const invalid = DomainMarketplacePurchaseRequestListQuerySchema.safeParse({ limit: "abc" });
    expect(invalid.success).toBe(false);
  });
});
