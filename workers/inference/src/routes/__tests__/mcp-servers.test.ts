import { describe, it, expect } from "vitest";
import { createMcpServerSchema, updateMcpServerSchema } from "../mcp-servers.ts";

// Doc: Phase-0 API-completeness review (2026-07-17). Same validation
// contract as lib/agentcore/agent-schema.ts's createMcpServerSchema /
// updateMcpServerSchema (kept in sync by hand, see mcp-servers.ts header).

describe("createMcpServerSchema", () => {
  it("accepts a minimal static-auth server", () => {
    const r = createMcpServerSchema.safeParse({
      slug: "search-tool",
      display_name: "Search Tool",
      server_url: "https://mcp.example.com",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an uppercase or malformed slug", () => {
    expect(
      createMcpServerSchema.safeParse({ slug: "Search Tool", display_name: "x", server_url: "https://e.com" }).success
    ).toBe(false);
  });

  it("rejects a non-http(s) server_url", () => {
    expect(
      createMcpServerSchema.safeParse({ slug: "x", display_name: "x", server_url: "ftp://e.com" }).success
    ).toBe(false);
  });

  it("requires oauth_client_id when auth_type is oauth", () => {
    const r = createMcpServerSchema.safeParse({
      slug: "x", display_name: "x", server_url: "https://e.com", auth_type: "oauth",
    });
    expect(r.success).toBe(false);
  });

  it("rejects oauth_client_id on a static server", () => {
    const r = createMcpServerSchema.safeParse({
      slug: "x", display_name: "x", server_url: "https://e.com", auth_type: "static", oauth_client_id: "abc",
    });
    expect(r.success).toBe(false);
  });

  it("accepts a complete oauth server", () => {
    const r = createMcpServerSchema.safeParse({
      slug: "x", display_name: "x", server_url: "https://e.com", auth_type: "oauth", oauth_client_id: "abc",
    });
    expect(r.success).toBe(true);
  });
});

describe("updateMcpServerSchema", () => {
  it("rejects an empty patch", () => {
    expect(updateMcpServerSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a partial patch", () => {
    expect(updateMcpServerSchema.safeParse({ display_name: "New name" }).success).toBe(true);
  });

  it("has no slug/auth_type field at all — not editable by design", () => {
    // Passing them through is simply ignored by the schema (stripped), not
    // rejected — the route never reads them either way.
    const r = updateMcpServerSchema.safeParse({ display_name: "x", slug: "should-be-ignored" });
    expect(r.success).toBe(true);
    if (r.success) expect("slug" in r.data).toBe(false);
  });
});
