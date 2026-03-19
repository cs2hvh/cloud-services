import { describe, expect, it } from "vitest";
import { createDomainActor, resolveIdempotencyKey } from "@/lib/domain-service/http/request-context";

describe("domain request context", () => {
  it("generates a valid fallback request id when header is missing/invalid", () => {
    const actorFromMissing = createDomainActor({
      req: new Request("http://localhost/test"),
      userId: "user-1",
    });

    const actorFromInvalid = createDomainActor({
      req: new Request("http://localhost/test", {
        headers: { "x-request-id": "req-123" },
      }),
      userId: "user-1",
    });

    expect(actorFromMissing.auditContext?.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(actorFromInvalid.auditContext?.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(actorFromInvalid.auditContext?.requestId).not.toBe("req-123");
  });

  it("keeps valid UUID request id and valid client IP", () => {
    const requestId = "48a742cb-28f3-4e8d-9da8-96811dc08c64";
    const actor = createDomainActor({
      req: new Request("http://localhost/test", {
        headers: {
          "x-request-id": requestId,
          "x-forwarded-for": "203.0.113.10, 10.0.0.1",
        },
      }),
      userId: "user-1",
    });

    expect(actor.auditContext?.requestId).toBe(requestId);
    expect(actor.auditContext?.ipAddress).toBe("203.0.113.10");
  });

  it("does not set invalid client IP values", () => {
    const actor = createDomainActor({
      req: new Request("http://localhost/test", {
        headers: {
          "x-forwarded-for": "unknown",
          "x-real-ip": "bad-ip-value",
        },
      }),
      userId: "user-1",
    });

    expect(actor.auditContext?.ipAddress).toBeUndefined();
  });

  it("resolves idempotency key with header precedence", () => {
    const fromHeader = resolveIdempotencyKey(
      new Request("http://localhost/test", { headers: { "idempotency-key": "header-key" } }),
      "body-key"
    );
    const fromBody = resolveIdempotencyKey(new Request("http://localhost/test"), "body-key");

    expect(fromHeader).toBe("header-key");
    expect(fromBody).toBe("body-key");
  });
});
