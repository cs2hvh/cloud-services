import { describe, it, expect } from "vitest";
import {
  DOMAIN_ERROR_CODES,
  DomainServiceError,
  mapDomainErrorToHttp,
} from "@/lib/domain-service/core/errors";

describe("domain error mapping", () => {
  it("maps not-found errors to 404", () => {
    const mapped = mapDomainErrorToHttp(
      new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_NOT_FOUND,
        message: "Domain not found",
      })
    );

    expect(mapped.status).toBe(404);
    expect(mapped.code).toBe("DOMAIN_NOT_FOUND");
  });

  it("maps provider rate limits to 429", () => {
    const mapped = mapDomainErrorToHttp(
      new DomainServiceError({
        code: DOMAIN_ERROR_CODES.PROVIDER_RATE_LIMITED,
        message: "Rate limited",
        retryable: true,
      })
    );

    expect(mapped.status).toBe(429);
    expect(mapped.code).toBe("PROVIDER_RATE_LIMITED");
  });
});
