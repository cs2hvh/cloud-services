#!/usr/bin/env tsx
import { createNameComApiService } from "@/lib/domain-service/application/namecom-api.service";
import type { NameComRecordType } from "@/lib/domain-service/integrations/namecom-registrar.adapter";

function usage() {
  console.log(`Name.com Core API developer tool

Usage:
  npm run namecom:dev -- check
  npm run namecom:dev -- hello
  npm run namecom:dev -- balance
  npm run namecom:dev -- domains:list [page] [perPage]
  npm run namecom:dev -- domain:get <domain>
  npm run namecom:dev -- domains:availability <domain> [domain...]
  npm run namecom:dev -- domains:search <keyword> [tldCsv]
  npm run namecom:dev -- domains:purchase <domain> [purchasePrice] [purchaseType] [idempotencyKey]
  npm run namecom:dev -- dns:list <domain>
  npm run namecom:dev -- dns:create <domain> <host> <type> <answer> [ttl] [priority]
  npm run namecom:dev -- dns:update <domain> <recordId> <host> <type> <answer> [ttl] [priority]
  npm run namecom:dev -- dns:delete <domain> <recordId>

Required env:
  NAMECOM_USERNAME
  NAMECOM_API_TOKEN
Optional env:
  NAMECOM_API_BASE_URL (default in development: https://api.dev.name.com)
  NAMECOM_BASIC_AUTH   (alternative to username/token, value can include or omit 'Basic ' prefix)
`);
}

function asInt(value: string | undefined, fallback?: number): number | undefined {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command) {
    usage();
    process.exit(1);
  }

  const service = createNameComApiService();

  try {
    if (command === "check") {
      const hello = await service.hello();
      const balance = await service.checkBalance();
      const domains = await service.listDomains({ page: 1, perPage: 10 });
      console.log(
        JSON.stringify(
          {
            hello,
            balance,
            domains: {
              totalCount: domains.totalCount ?? domains.domains?.length ?? 0,
              from: domains.from ?? null,
              to: domains.to ?? null,
              sample: (domains.domains || []).slice(0, 5).map((d) => d.domainName),
            },
          },
          null,
          2
        )
      );
      return;
    }

    if (command === "hello") {
      const data = await service.hello();
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (command === "balance") {
      const data = await service.checkBalance();
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (command === "domains:list") {
      const [pageArg, perPageArg] = rest;
      const data = await service.listDomains({
        page: asInt(pageArg, 1),
        perPage: asInt(perPageArg, 100),
      });
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (command === "domain:get") {
      const [domain] = rest;
      if (!domain) {
        throw new Error("domain:get requires <domain>");
      }
      const data = await service.getDomain(domain);
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (command === "domains:availability") {
      if (rest.length === 0) {
        throw new Error("domains:availability requires at least one <domain>");
      }
      const data = await service.checkAvailability(rest);
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (command === "domains:search") {
      const [keyword, tldCsv] = rest;
      if (!keyword) {
        throw new Error("domains:search requires <keyword>");
      }
      const tldFilter = tldCsv
        ? tldCsv
            .split(",")
            .map((tld) => tld.trim().replace(/^\./, ""))
            .filter(Boolean)
        : undefined;
      const data = await service.searchDomains({
        keyword,
        timeout: 2500,
        tldFilter,
      });
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (command === "domains:purchase") {
      const [domain, purchasePriceArg, purchaseTypeArg, idempotencyKey] = rest;
      if (!domain) {
        throw new Error("domains:purchase requires <domain>");
      }

      const parsedPrice = purchasePriceArg ? Number.parseFloat(purchasePriceArg) : undefined;
      const purchasePrice = Number.isFinite(parsedPrice) ? parsedPrice : undefined;
      const purchaseType = purchaseTypeArg || "registration";

      const data = await service.purchaseDomain(
        {
          domainName: domain,
          purchasePrice,
          purchaseType,
        },
        { idempotencyKey }
      );

      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (command === "dns:list") {
      const [domain] = rest;
      if (!domain) {
        throw new Error("dns:list requires <domain>");
      }
      const data = await service.listDnsRecords(domain, { perPage: 1000, page: 1 });
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (command === "dns:create") {
      const [domain, host, type, answer, ttlArg, priorityArg] = rest;
      if (!domain || !host || !type || !answer) {
        throw new Error("dns:create requires <domain> <host> <type> <answer> [ttl] [priority]");
      }

      const ttl = asInt(ttlArg, 300);
      const priority = asInt(priorityArg);
      const data = await service.createDnsRecord(domain, {
        host,
        type: type as NameComRecordType,
        answer,
        ttl,
        priority,
      });
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (command === "dns:update") {
      const [domain, recordIdArg, host, type, answer, ttlArg, priorityArg] = rest;
      if (!domain || !recordIdArg || !host || !type || !answer) {
        throw new Error("dns:update requires <domain> <recordId> <host> <type> <answer> [ttl] [priority]");
      }

      const recordId = Number.parseInt(recordIdArg, 10);
      if (Number.isNaN(recordId)) {
        throw new Error("recordId must be an integer");
      }

      const ttl = asInt(ttlArg, 300);
      const priority = asInt(priorityArg);
      const data = await service.updateDnsRecord(domain, recordId, {
        host,
        type: type as NameComRecordType,
        answer,
        ttl,
        priority,
      });
      console.log(JSON.stringify(data, null, 2));
      return;
    }

    if (command === "dns:delete") {
      const [domain, recordIdArg] = rest;
      if (!domain || !recordIdArg) {
        throw new Error("dns:delete requires <domain> <recordId>");
      }

      const recordId = Number.parseInt(recordIdArg, 10);
      if (Number.isNaN(recordId)) {
        throw new Error("recordId must be an integer");
      }

      await service.deleteDnsRecord(domain, recordId);
      console.log(JSON.stringify({ success: true, deleted_record_id: recordId }, null, 2));
      return;
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (error: unknown) {
    const maybe = error as { code?: string; message?: string; details?: Record<string, unknown> };
    console.error(
      JSON.stringify(
        {
          success: false,
          error: maybe.code || "UNKNOWN",
          message: maybe.message || "Unknown error",
          details: maybe.details,
        },
        null,
        2
      )
    );
    process.exit(1);
  }
}

void main();
