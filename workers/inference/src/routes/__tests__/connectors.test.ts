import { describe, it, expect } from "vitest";
import { createConnectorSchema, updateConnectorSchema, validateConfigForKind } from "../connectors.ts";

// Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (Slice C1).
// Same validation contract as the dashboard-side lib/inference/connectors.ts
// (kept in sync by hand — the Worker can't import from lib/). The gateway
// create schema has NO collection_id (it's a URL param); the dashboard one does.

describe("createConnectorSchema (gateway)", () => {
  it("accepts a valid S3 connector with a credential", () => {
    const r = createConnectorSchema.safeParse({
      kind: "s3",
      display_name: "prod-docs",
      config: { bucket: "acme-docs", region: "us-east-1", prefix: "handbook/" },
      credential: { access_key_id: "AKIA123", secret_access_key: "secret" },
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid web_crawl connector and applies defaults", () => {
    const r = createConnectorSchema.safeParse({
      kind: "web_crawl",
      display_name: "docs-site",
      config: { seed_url: "https://docs.example.com" },
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.kind === "web_crawl") {
      expect(r.data.config.max_pages).toBe(50);
      expect(r.data.config.max_depth).toBe(2);
      expect(r.data.sync_schedule).toBe("manual");
    }
  });

  it("rejects an S3 connector without a credential", () => {
    const r = createConnectorSchema.safeParse({
      kind: "s3",
      display_name: "x",
      config: { bucket: "b" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects an S3 connector without a bucket", () => {
    const r = createConnectorSchema.safeParse({
      kind: "s3",
      display_name: "x",
      config: { region: "us-east-1" },
      credential: { access_key_id: "a", secret_access_key: "b" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a web_crawl connector without a seed_url", () => {
    const r = createConnectorSchema.safeParse({
      kind: "web_crawl",
      display_name: "x",
      config: { max_pages: 10 },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-http(s) seed_url", () => {
    const r = createConnectorSchema.safeParse({
      kind: "web_crawl",
      display_name: "x",
      config: { seed_url: "ftp://example.com" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-http(s) S3 endpoint and webhook URL at create time", () => {
    expect(
      createConnectorSchema.safeParse({
        kind: "s3",
        display_name: "x",
        config: { bucket: "b", endpoint: "ftp://storage.example.com" },
        credential: { access_key_id: "a", secret_access_key: "b" },
      }).success
    ).toBe(false);

    expect(
      createConnectorSchema.safeParse({
        kind: "web_crawl",
        display_name: "x",
        config: { seed_url: "https://docs.example.com" },
        webhook_url: "ftp://hooks.example.com/sync",
      }).success
    ).toBe(false);
  });

  it("accepts http(s) S3-compatible endpoints and webhook URLs", () => {
    expect(
      createConnectorSchema.safeParse({
        kind: "s3",
        display_name: "r2",
        config: { bucket: "b", endpoint: "https://account.r2.cloudflarestorage.com" },
        credential: { access_key_id: "a", secret_access_key: "b" },
        webhook_url: "https://hooks.example.com/sync",
      }).success
    ).toBe(true);
  });

  it("rejects an unknown kind", () => {
    const r = createConnectorSchema.safeParse({
      kind: "gdrive",
      display_name: "x",
      config: {},
    });
    expect(r.success).toBe(false);
  });

  it("does not accept a collection_id (that's a URL param on the gateway)", () => {
    // Extra keys are stripped by zod, not rejected — assert it's simply absent.
    const r = createConnectorSchema.safeParse({
      kind: "web_crawl",
      display_name: "x",
      config: { seed_url: "https://e.com" },
      collection_id: "should-be-ignored",
    });
    expect(r.success).toBe(true);
    if (r.success) expect("collection_id" in r.data).toBe(false);
  });
});

describe("updateConnectorSchema (gateway)", () => {
  it("rejects an empty patch", () => {
    expect(updateConnectorSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a partial patch", () => {
    expect(updateConnectorSchema.safeParse({ display_name: "New" }).success).toBe(true);
  });

  it("accepts webhook_url: null to clear it", () => {
    expect(updateConnectorSchema.safeParse({ webhook_url: null }).success).toBe(true);
  });

  it("rejects non-http(s) webhook_url patches", () => {
    expect(updateConnectorSchema.safeParse({ webhook_url: "ftp://hooks.example.com/sync" }).success).toBe(false);
  });

  it("accepts a credential replacement", () => {
    const r = updateConnectorSchema.safeParse({
      credential: { access_key_id: "new", secret_access_key: "new" },
    });
    expect(r.success).toBe(true);
  });

  it("has no kind field — a connector's source type is immutable", () => {
    const r = updateConnectorSchema.safeParse({ display_name: "x", kind: "s3" });
    expect(r.success).toBe(true);
    if (r.success) expect("kind" in r.data).toBe(false);
  });

  it("accepts webhook_secret: null to clear it (back to unsigned)", () => {
    expect(updateConnectorSchema.safeParse({ webhook_secret: null }).success).toBe(true);
  });
});

describe("webhook_secret validation", () => {
  const base = {
    kind: "web_crawl" as const,
    display_name: "docs",
    config: { seed_url: "https://docs.example.com" },
  };

  it("accepts a 16+ char signing secret", () => {
    expect(createConnectorSchema.safeParse({ ...base, webhook_secret: "a".repeat(16) }).success).toBe(true);
  });

  it("rejects a too-short secret — a 4-char HMAC key is not a signing key", () => {
    expect(createConnectorSchema.safeParse({ ...base, webhook_secret: "abcd" }).success).toBe(false);
  });

  it("is optional — a connector without one sends the webhook unsigned", () => {
    const r = createConnectorSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.webhook_secret).toBeUndefined();
  });
});

describe("validateConfigForKind (PATCH config re-validation)", () => {
  it("rejects a web_crawl config with no seed_url — a 400, not a sync-time crash", () => {
    const r = validateConfigForKind("web_crawl", {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("seed_url");
  });

  it("rejects an s3 config with no bucket", () => {
    const r = validateConfigForKind("s3", { region: "us-east-1" });
    expect(r.ok).toBe(false);
  });

  it("rejects a non-http(s) seed_url", () => {
    expect(validateConfigForKind("web_crawl", { seed_url: "file:///etc/passwd" }).ok).toBe(false);
  });

  it("rejects a non-http(s) S3 endpoint", () => {
    expect(validateConfigForKind("s3", { bucket: "acme", endpoint: "ftp://storage.example.com" }).ok).toBe(false);
  });

  it("accepts a valid crawl config and fills the defaults", () => {
    const r = validateConfigForKind("web_crawl", { seed_url: "https://docs.example.com" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config).toMatchObject({ max_pages: 50, max_depth: 2 });
  });

  it("keeps a config key the dashboard form never renders (max_documents)", () => {
    const r = validateConfigForKind("s3", { bucket: "acme", max_documents: 50 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.max_documents).toBe(50);
  });
});
