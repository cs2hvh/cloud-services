//@ts-nocheck
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/billing/topup/route";
import { expectResponseStatus } from "../../utils/test-helpers";

describe("POST /api/billing/topup", () => {
  it("TC-DEPRECATED-002: should return 410 Gone for deprecated direct topup endpoint", async () => {
    const request = new Request("http://localhost:3000/api/billing/topup", {
      method: "POST",
    });

    const response = await POST(request);
    const data = await expectResponseStatus(response, 410);

    expect(data.error).toContain("Direct top-ups are disabled");
  });
});
