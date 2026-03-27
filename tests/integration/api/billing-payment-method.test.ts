//@ts-nocheck
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/billing/payment-method/route";
import { expectResponseStatus } from "../../utils/test-helpers";

describe("POST /api/billing/payment-method", () => {
  it("TC-DEPRECATED-001: should return 410 Gone for deprecated payment-method endpoint", async () => {
    const request = new Request(
      "http://localhost:3000/api/billing/payment-method",
      {
        method: "POST",
      }
    );

    const response = await POST(request);
    const data = await expectResponseStatus(response, 410);

    expect(data.error).toContain("deprecated");
    expect(data.error).toContain("Stripe");
  });
});
