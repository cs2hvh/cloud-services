import { describe, it, expect } from "vitest";
import { withReturnToParam } from "@/lib/api/return-to";
import { sanitizeReturnTo, DEFAULT_OAUTH_RETURN_TO } from "@/lib/api/oauth-state";
import { buildSettingsRedirect } from "@/app/dashboard/nav/settings-redirect";

describe("withReturnToParam", () => {
  it("uses & when returnTo already carries a query string", () => {
    // The regression this guards: a hard-coded "?" produced
    // "?tab=account?error=x", parsing tab as "account?error=x" and losing the flag.
    const url = withReturnToParam("/dashboard/settings?tab=account", "error", "invalid_state");
    expect(url).toBe("/dashboard/settings?tab=account&error=invalid_state");
    expect(new URLSearchParams(url.split("?")[1]).get("tab")).toBe("account");
  });

  it("uses ? when returnTo has no query string", () => {
    expect(withReturnToParam("/dashboard/settings", "error", "no_token")).toBe(
      "/dashboard/settings?error=no_token"
    );
  });

  it("encodes keys and values", () => {
    expect(withReturnToParam("/dashboard/x", "a b", "c&d")).toBe("/dashboard/x?a%20b=c%26d");
  });

  it("keeps the flag readable for every callback error code", () => {
    const codes = [
      "missing_code",
      "invalid_state",
      "invalid_user",
      "config_error",
      "token_exchange_failed",
      "no_token",
      "user_info_failed",
      "token_storage_failed",
      "unknown",
    ];
    for (const code of codes) {
      const url = withReturnToParam(DEFAULT_OAUTH_RETURN_TO, "error", code);
      expect(new URLSearchParams(url.split("?")[1]).get("error")).toBe(code);
    }
  });
});

describe("sanitizeReturnTo", () => {
  it("falls back to the Connections tab", () => {
    expect(sanitizeReturnTo(undefined)).toBe(DEFAULT_OAUTH_RETURN_TO);
    expect(sanitizeReturnTo("https://evil.example.com")).toBe(DEFAULT_OAUTH_RETURN_TO);
    expect(sanitizeReturnTo("//evil.example.com")).toBe(DEFAULT_OAUTH_RETURN_TO);
  });

  it("preserves internal dashboard paths, query string included", () => {
    expect(sanitizeReturnTo("/dashboard/services/apps/1")).toBe("/dashboard/services/apps/1");
    expect(sanitizeReturnTo("/dashboard/settings?tab=account")).toBe(
      "/dashboard/settings?tab=account"
    );
  });

  it("round-trips through withReturnToParam without corrupting the default", () => {
    const url = withReturnToParam(sanitizeReturnTo(null), "error", "unknown");
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("tab")).toBe("account");
    expect(params.get("error")).toBe("unknown");
  });
});

describe("buildSettingsRedirect", () => {
  it("targets the requested tab", () => {
    expect(buildSettingsRedirect("profile", {})).toBe("/dashboard/settings?tab=profile");
  });

  it("carries reconnect and returnTo through the legacy route", () => {
    const params = new URLSearchParams(
      buildSettingsRedirect("account", {
        reconnect: "github",
        returnTo: "/dashboard/services/apps/abc",
      }).split("?")[1]
    );
    expect(params.get("tab")).toBe("account");
    expect(params.get("reconnect")).toBe("github");
    expect(params.get("returnTo")).toBe("/dashboard/services/apps/abc");
  });

  it("ignores an incoming tab so the legacy route decides", () => {
    expect(buildSettingsRedirect("profile", { tab: "security" })).toBe(
      "/dashboard/settings?tab=profile"
    );
  });

  it("preserves repeated params", () => {
    const params = new URLSearchParams(
      buildSettingsRedirect("security", { flag: ["a", "b"] }).split("?")[1]
    );
    expect(params.getAll("flag")).toEqual(["a", "b"]);
  });
});
