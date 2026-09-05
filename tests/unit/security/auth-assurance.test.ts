import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

import {
  assuranceFromAccessToken,
  requiresSecondFactor,
  secondFactorMissing,
} from "@/lib/auth/assurance";

function jwtWith(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.signature`;
}

const verifiedTotp = { factors: [{ id: "f1", factor_type: "totp", status: "verified" as const, created_at: "", updated_at: "" }] };
const unverifiedTotp = { factors: [{ id: "f1", factor_type: "totp", status: "unverified" as const, created_at: "", updated_at: "" }] };

describe("lib/auth/assurance", () => {
  it("reads the aal claim from an access token without trusting anything else", () => {
    expect(assuranceFromAccessToken(jwtWith({ sub: "u", aal: "aal1" }))).toBe("aal1");
    expect(assuranceFromAccessToken(jwtWith({ sub: "u", aal: "aal2" }))).toBe("aal2");
    expect(assuranceFromAccessToken(jwtWith({ sub: "u" }))).toBeNull();
    expect(assuranceFromAccessToken("not-a-jwt")).toBeNull();
    expect(assuranceFromAccessToken("sk_live_abc")).toBeNull();
  });

  it("requires a second factor only when a factor is verified", () => {
    expect(requiresSecondFactor(verifiedTotp)).toBe(true);
    expect(requiresSecondFactor(unverifiedTotp)).toBe(false);
    expect(requiresSecondFactor({ factors: [] })).toBe(false);
    expect(requiresSecondFactor(null)).toBe(false);
  });

  it("refuses a definite aal1 on an MFA account, and nothing else", () => {
    // The bypass this exists to stop: password-only token on an enrolled account.
    expect(secondFactorMissing(verifiedTotp, "aal1")).toBe(true);
    // The stepped-up session is fine.
    expect(secondFactorMissing(verifiedTotp, "aal2")).toBe(false);
    // Accounts without MFA are never affected.
    expect(secondFactorMissing(unverifiedTotp, "aal1")).toBe(false);
    expect(secondFactorMissing({ factors: [] }, "aal1")).toBe(false);
    // An unreadable level fails open by design; see the module comment.
    expect(secondFactorMissing(verifiedTotp, null)).toBe(false);
  });
});
