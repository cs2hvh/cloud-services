/**
 * Name.com Sandbox Integration Tests
 *
 * These tests run against the real Name.com sandbox API (api.dev.name.com).
 * They require the following env vars to be set — copy from .env.local:
 *
 *   NAMECOM_API_BASE_URL=https://api.dev.name.com
 *   NAMECOM_API_TOKEN=00e230e62059556ad0a87b70caabc77bd6cd637c
 *   NAMECOM_USERNAME=ahurasense-test
 *
 * Run with:
 *   npx vitest run tests/integration/services/namecom-sandbox.test.ts
 *
 * The sandbox is safe to write to — purchases are free and DNS changes are isolated.
 *
 * Test domain used: testdomainwork.com (already owned in the sandbox account)
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { NameComRegistrarAdapter } from "@/lib/domain-service/integrations/namecom-registrar.adapter";
import { NameComDnsProviderAdapter } from "@/lib/domain-service/integrations/dns-provider.adapter";

// --------------------------------------------------------------------------
// Guard: skip the whole suite when sandbox credentials are not available.
// --------------------------------------------------------------------------
const SANDBOX_CONFIGURED =
  !!process.env.NAMECOM_API_BASE_URL &&
  !!process.env.NAMECOM_API_TOKEN &&
  !!process.env.NAMECOM_USERNAME;

const itSandbox = SANDBOX_CONFIGURED ? it : it.skip;

// Domain we own in the sandbox — safe to read/write DNS records on.
const TEST_DOMAIN = "testdomainwork.com";

// --------------------------------------------------------------------------
// Shared adapter instances
// --------------------------------------------------------------------------
let registrar: NameComRegistrarAdapter;
let dnsProvider: NameComDnsProviderAdapter;

beforeAll(() => {
  registrar = new NameComRegistrarAdapter();
  dnsProvider = new NameComDnsProviderAdapter(registrar);
});

// --------------------------------------------------------------------------
// Cleanup: remove any TXT records we created during this test run.
// --------------------------------------------------------------------------
const createdRecordIds: number[] = [];

afterEach(async () => {
  if (createdRecordIds.length === 0) return;
  await Promise.allSettled(
    createdRecordIds.map((id) => registrar.deleteRecord(TEST_DOMAIN, id))
  );
  createdRecordIds.length = 0;
});

// ==========================================================================
// 1. Authentication
// ==========================================================================
describe("Authentication", () => {
  itSandbox("hello endpoint returns the sandbox username", async () => {
    const result = await registrar.hello();

    expect(result.username).toBeTruthy();
    expect(result.serverName).toBeTruthy();
    // Sandbox server time should be a valid ISO date.
    expect(new Date(result.serverTime).getFullYear()).toBeGreaterThan(2020);
  });
});

// ==========================================================================
// 2. Domain listing and lookup
// ==========================================================================
describe("Domain listing", () => {
  itSandbox("lists domains owned in the sandbox account", async () => {
    const result = await registrar.listDomains({ perPage: 10 });

    expect(Array.isArray(result.domains)).toBe(true);
    expect(result.domains.length).toBeGreaterThan(0);

    const names = result.domains.map((d) => d.domainName);
    expect(names).toContain(TEST_DOMAIN);
  });

  itSandbox("fetches details for the test domain", async () => {
    const result = await registrar.getDomain(TEST_DOMAIN);

    expect(result.domainName).toBe(TEST_DOMAIN);
    expect(result.nameservers).toBeDefined();
    expect(result.nameservers!.length).toBeGreaterThan(0);
  });

  itSandbox("getDomainSummary returns expiry and creation dates", async () => {
    const result = await registrar.getDomainSummary(TEST_DOMAIN);

    expect(result).not.toBeNull();
    expect(result!.domainName).toBe(TEST_DOMAIN);
    expect(result!.createdAt).toBeTruthy();
    expect(result!.expiresAt).toBeTruthy();
  });

  itSandbox("getDomainSummary throws DOMAIN_NOT_FOUND for a domain not in account", async () => {
    // A 404 from the API is mapped to a DomainServiceError with code DOMAIN_NOT_FOUND.
    // Callers like resolveManagedZone catch this to continue probing candidate zones.
    await expect(
      registrar.getDomainSummary("this-domain-is-definitely-not-owned.xyz")
    ).rejects.toMatchObject({
      code: "DOMAIN_NOT_FOUND",
    });
  });
});

// ==========================================================================
// 3. Domain availability search
// ==========================================================================
describe("Domain search", () => {
  itSandbox("checkAvailability returns results for multiple TLDs", async () => {
    const result = await registrar.checkAvailability([
      "definitely-not-taken-xyzabc123.com",
      "definitely-not-taken-xyzabc123.net",
    ]);

    expect(result.results.length).toBeGreaterThan(0);
    result.results.forEach((r) => {
      expect(r.domainName).toBeTruthy();
      expect(typeof r.purchasable).toBe("boolean");
    });
  });

  itSandbox("searchDomains returns suggestions for a keyword", async () => {
    const result = await registrar.searchDomains({
      keyword: "cloud-platform",
      timeout: 2000,
      tldFilter: ["com", "net", "io"],
    });

    expect(result.results.length).toBeGreaterThan(0);
    result.results.forEach((r) => {
      expect(r.domainName).toBeTruthy();
    });
  });
});

// ==========================================================================
// 4. DNS record CRUD on the sandbox test domain
// ==========================================================================
describe("DNS record management", () => {
  itSandbox("lists existing DNS records for the test domain", async () => {
    const result = await registrar.listRecords(TEST_DOMAIN);

    expect(Array.isArray(result.records)).toBe(true);
    // The domain may have default NS records from Name.com.
  });

  itSandbox("creates, reads, updates, and deletes a TXT record", async () => {
    const uniqueValue = `platform-test-${Date.now()}`;

    // CREATE
    const created = await registrar.createRecord(TEST_DOMAIN, {
      host: "platform-verify",
      type: "TXT",
      answer: uniqueValue,
      ttl: 300,
    });

    expect(created.id).toBeDefined();
    expect(typeof created.id).toBe("number");
    createdRecordIds.push(created.id!);

    // READ — verify it appears in the list
    const list = await registrar.listRecords(TEST_DOMAIN);
    const found = list.records.find((r) => r.id === created.id);
    expect(found).toBeDefined();
    expect(found?.answer).toBe(uniqueValue);

    // UPDATE
    const updatedValue = `${uniqueValue}-updated`;
    const updated = await registrar.updateRecord(TEST_DOMAIN, created.id!, {
      host: "platform-verify",
      type: "TXT",
      answer: updatedValue,
      ttl: 300,
    });

    expect(updated.answer).toBe(updatedValue);

    // DELETE
    await registrar.deleteRecord(TEST_DOMAIN, created.id!);
    // Remove from cleanup list since we deleted it manually.
    const idx = createdRecordIds.indexOf(created.id!);
    if (idx !== -1) createdRecordIds.splice(idx, 1);

    // Confirm it's gone
    const afterDelete = await registrar.listRecords(TEST_DOMAIN);
    const stillThere = afterDelete.records.find((r) => r.id === created.id);
    expect(stillThere).toBeUndefined();
  });

  itSandbox("creates a CNAME record for a subdomain", async () => {
    const created = await registrar.createRecord(TEST_DOMAIN, {
      host: "app-staging",
      type: "CNAME",
      answer: "demo-app.galaxyhvh.com.",
      ttl: 300,
    });

    expect(created.id).toBeDefined();
    expect(created.type).toBe("CNAME");
    createdRecordIds.push(created.id!);
  });
});

// ==========================================================================
// 5. DnsProviderAdapter — managed zone detection
// ==========================================================================
describe("DnsProviderAdapter (managed zone)", () => {
  itSandbox(
    "ensureRoutingRecord creates a CNAME for a known managed subdomain",
    async () => {
      const fqdn = `ci-test-${Date.now()}.${TEST_DOMAIN}`;
      // Use a unique per-run target so we can identify it by answer without
      // relying on ID diffing (which breaks when the zone's record list spans
      // multiple pages and the newly-created record lands on page 2+).
      const target = `demo-${Date.now()}.galaxyhvh.com.`;

      // This probes getDomainSummary to confirm TEST_DOMAIN is managed, then upserts a record.
      await dnsProvider.ensureRoutingRecord({ fqdn, target, ttl: 300 });

      // Locate the record by its unique answer rather than by ID diff.
      // Name.com strips the trailing dot on CNAME answers when returning records,
      // so compare after normalizing both sides.
      const normalizeAnswer = (s: string) => s.replace(/\.$/, "").toLowerCase();
      const after = await registrar.listRecords(TEST_DOMAIN);
      const createdRecord = after.records.find(
        (r) =>
          (r.type === "CNAME" || r.type === "ANAME") &&
          normalizeAnswer(r.answer) === normalizeAnswer(target)
      );

      expect(createdRecord).toBeDefined();
      expect(createdRecord!.answer).toContain("galaxyhvh.com");

      // Cleanup — delete the record we just created.
      if (createdRecord?.id != null) {
        await registrar.deleteRecord(TEST_DOMAIN, createdRecord.id);
      }
    },
    20_000 // Allow extra time for managed-zone probe + record creation
  );

  itSandbox(
    "removeRoutingRecord removes the record created by ensureRoutingRecord",
    async () => {
      const fqdn = `ci-remove-${Date.now()}.${TEST_DOMAIN}`;
      // Use a unique per-run target for the same reason as the create test.
      const target = `demo-${Date.now()}.galaxyhvh.com.`;

      await dnsProvider.ensureRoutingRecord({ fqdn, target, ttl: 300 });
      await dnsProvider.removeRoutingRecord({ fqdn, target });

      const list = await registrar.listRecords(TEST_DOMAIN);
      const host = fqdn.replace(`.${TEST_DOMAIN}`, "");
      const record = list.records.find(
        (r) => r.host === host && (r.type === "CNAME" || r.type === "ANAME")
      );

      expect(record).toBeUndefined();
    },
    20_000
  );

  itSandbox(
    "throws DomainServiceError for a domain not managed by Name.com",
    async () => {
      await expect(
        dnsProvider.ensureRoutingRecord({
          fqdn: "app.completelyrandomexternaldomain12345.com",
          target: "target.galaxyhvh.com.",
          ttl: 300,
        })
      ).rejects.toMatchObject({
        code: "DOMAIN_INVALID",
      });
    }
  );
});
