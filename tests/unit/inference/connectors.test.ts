import { describe, it, expect } from "vitest";
import {
  createConnectorSchema,
  updateConnectorSchema,
  validateConfigForKind,
  toConnectorResponse,
  type ConnectorRow,
} from "@/lib/inference/connectors";

// Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (Slice C1).
// The dashboard-side copy of the connector contract (the Worker-side twin is
// tested in workers/inference/src/routes/__tests__/connectors.test.ts). Unlike
// the gateway, the dashboard create schema carries collection_id in the body.

describe("createConnectorSchema (dashboard)", () => {
  const collection_id = "11111111-1111-1111-1111-111111111111";

  it("accepts a valid S3 connector with a credential", () => {
    const r = createConnectorSchema.safeParse({
      kind: "s3",
      collection_id,
      display_name: "prod-docs",
      config: { bucket: "acme-docs", region: "us-east-1" },
      credential: { access_key_id: "AKIA123", secret_access_key: "secret" },
    });
    expect(r.success).toBe(true);
  });

  it("accepts a valid web_crawl connector and applies defaults", () => {
    const r = createConnectorSchema.safeParse({
      kind: "web_crawl",
      collection_id,
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

  it("requires a valid uuid collection_id", () => {
    expect(
      createConnectorSchema.safeParse({
        kind: "web_crawl",
        collection_id: "not-a-uuid",
        display_name: "x",
        config: { seed_url: "https://e.com" },
      }).success
    ).toBe(false);
  });

  it("rejects an S3 connector without a credential", () => {
    expect(
      createConnectorSchema.safeParse({
        kind: "s3",
        collection_id,
        display_name: "x",
        config: { bucket: "b" },
      }).success
    ).toBe(false);
  });

  it("rejects a non-http(s) seed_url", () => {
    expect(
      createConnectorSchema.safeParse({
        kind: "web_crawl",
        collection_id,
        display_name: "x",
        config: { seed_url: "ftp://example.com" },
      }).success
    ).toBe(false);
  });

  it("rejects a non-http(s) S3 endpoint and webhook URL at create time", () => {
    expect(
      createConnectorSchema.safeParse({
        kind: "s3",
        collection_id,
        display_name: "x",
        config: { bucket: "b", endpoint: "ftp://storage.example.com" },
        credential: { access_key_id: "a", secret_access_key: "b" },
      }).success
    ).toBe(false);

    expect(
      createConnectorSchema.safeParse({
        kind: "web_crawl",
        collection_id,
        display_name: "x",
        config: { seed_url: "https://e.com" },
        webhook_url: "ftp://hooks.example.com/sync",
      }).success
    ).toBe(false);
  });
});

describe("updateConnectorSchema (dashboard)", () => {
  it("rejects an empty patch", () => {
    expect(updateConnectorSchema.safeParse({}).success).toBe(false);
  });
  it("accepts a partial patch", () => {
    expect(updateConnectorSchema.safeParse({ sync_schedule: "daily" }).success).toBe(true);
  });
  it("rejects non-http(s) webhook_url patches", () => {
    expect(updateConnectorSchema.safeParse({ webhook_url: "ftp://hooks.example.com/sync" }).success).toBe(false);
  });
});

describe("toConnectorResponse — credential masking (security-critical)", () => {
  const base: ConnectorRow = {
    id: "c1",
    org_id: "o1",
    collection_id: "col1",
    kind: "s3",
    display_name: "prod-docs",
    config: { bucket: "acme-docs", prefix: "docs/" },
    credential_enc: "\\xDEADBEEF", // pretend ciphertext
    webhook_url: "https://hook.example.com",
    webhook_secret_enc: "\\xCAFEBABE", // pretend ciphertext
    sync_schedule: "daily",
    status: "idle",
    last_error: null,
    last_synced_at: "2026-07-21T00:00:00Z",
    next_sync_at: "2026-07-22T00:00:00Z",
    docs_total: 10,
    docs_added: 3,
    docs_updated: 1,
    docs_removed: 2,
    docs_failed: 0,
    created_at: "2026-07-20T00:00:00Z",
    updated_at: "2026-07-21T00:00:00Z",
  };

  it("NEVER returns credential_enc — only a has_credential boolean", () => {
    const out = toConnectorResponse(base);
    // The ciphertext must appear nowhere in the serialized response.
    expect(JSON.stringify(out)).not.toContain("DEADBEEF");
    expect("credential_enc" in out).toBe(false);
    expect(out.has_credential).toBe(true);
  });

  it("reports has_credential:false when there is no stored credential", () => {
    const out = toConnectorResponse({ ...base, credential_enc: null });
    expect(out.has_credential).toBe(false);
  });

  it("NEVER returns webhook_secret_enc — only a has_webhook_secret boolean", () => {
    const out = toConnectorResponse(base);
    expect(JSON.stringify(out)).not.toContain("CAFEBABE");
    expect("webhook_secret_enc" in out).toBe(false);
    expect(out.has_webhook_secret).toBe(true);
    expect(toConnectorResponse({ ...base, webhook_secret_enc: null }).has_webhook_secret).toBe(false);
  });

  it("passes through config, status, and last-sync counters", () => {
    const out = toConnectorResponse(base);
    expect(out.config).toEqual({ bucket: "acme-docs", prefix: "docs/" });
    expect(out.status).toBe("idle");
    expect(out.last_sync).toEqual({
      docs_total: 10,
      docs_added: 3,
      docs_updated: 1,
      docs_removed: 2,
      docs_failed: 0,
    });
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
