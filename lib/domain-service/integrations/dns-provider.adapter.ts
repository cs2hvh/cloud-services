import { Resolver } from "dns";
import {
  DOMAIN_ERROR_CODES,
  DomainServiceError,
  toDomainServiceError,
} from "@/lib/domain-service/core/errors";
import type { DnsProviderPort } from "@/lib/domain-service/core/ports";
import {
  NameComRegistrarAdapter,
  type NameComRecord,
} from "@/lib/domain-service/integrations/namecom-registrar.adapter";

export class NameComDnsProviderAdapter implements DnsProviderPort {
  private readonly resolver: Resolver;

  constructor(private readonly nameCom: NameComRegistrarAdapter) {
    this.resolver = new Resolver();
    this.resolver.setServers(["8.8.8.8", "1.1.1.1"]);
  }

  async listTxtRecords(recordName: string): Promise<string[]> {
    try {
      const records = await withTimeout(
        new Promise<string[][]>((resolve, reject) => {
          this.resolver.resolveTxt(recordName, (err, addresses) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(addresses);
          });
        }),
        5000,
        `DNS TXT lookup timed out for ${recordName}`
      );

      return records.flat();
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code === "ENODATA" || code === "ENOTFOUND") {
        return [];
      }

      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `DNS TXT lookup failed for ${recordName}`,
        details: { dns_error: code || "UNKNOWN" },
      });
    }
  }

  async ensureRoutingRecord(params: { fqdn: string; target: string; ttl: number }): Promise<void> {
    const { zone, host } = await this.resolveManagedZone(params.fqdn);
    const ttl = Math.max(params.ttl, 300);
    const recordType = host === "@" ? "ANAME" : "CNAME";
    const providerHost = toProviderHost(host);

    const list = await this.nameCom.listRecords(zone);
    const existing = list.records.find(
      (record) => record.type === recordType && normalizeHost(record.host) === normalizeHost(host)
    );

    if (existing?.answer === params.target && Number(existing.ttl || 300) === ttl) {
      return;
    }

    // Cleanup conflicting host-alias records before writing desired routing type.
    const conflicts = list.records.filter((record) => {
      if (normalizeHost(record.host) !== normalizeHost(host)) return false;
      return record.type === "CNAME" || record.type === "ANAME";
    });

    await Promise.all(
      conflicts
        .filter((record) => typeof record.id === "number" && record.type !== recordType)
        .map((record) => this.nameCom.deleteRecord(zone, Number(record.id)))
    );

    if (existing?.id) {
      await this.nameCom.updateRecord(zone, existing.id, {
        host: providerHost,
        type: recordType,
        answer: params.target,
        ttl,
      });
      return;
    }

    await this.nameCom.createRecord(zone, {
      host: providerHost,
      type: recordType,
      answer: params.target,
      ttl,
    });
  }

  async removeRoutingRecord(params: { fqdn: string; target?: string }): Promise<void> {
    const { zone, host } = await this.resolveManagedZone(params.fqdn);
    const list = await this.nameCom.listRecords(zone);
    const allowedTypes = host === "@" ? new Set(["ANAME", "CNAME"]) : new Set(["CNAME"]);

    const matches = list.records.filter((record) => {
      if (!record.type || !allowedTypes.has(record.type)) return false;
      if (normalizeHost(record.host) !== normalizeHost(host)) return false;
      if (params.target && record.answer !== params.target) return false;
      return true;
    });

    await Promise.all(
      matches
        .filter((record) => typeof record.id === "number")
        .map((record) => this.nameCom.deleteRecord(zone, Number(record.id)))
    );
  }

  async ensureCnameRecord(params: { fqdn: string; target: string; ttl: number }): Promise<void> {
    await this.ensureRoutingRecord(params);
  }

  async removeCnameRecord(params: { fqdn: string; target?: string }): Promise<void> {
    await this.removeRoutingRecord(params);
  }

  private async resolveManagedZone(fqdn: string): Promise<{ zone: string; host: string }> {
    const normalized = normalizeFqdn(fqdn);
    const parts = normalized.split(".").filter(Boolean);

    if (parts.length < 2) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
        message: "Invalid FQDN for DNS management",
        details: { domain: fqdn },
      });
    }

    for (let i = 0; i <= parts.length - 2; i += 1) {
      const candidateZone = parts.slice(i).join(".");

      try {
        const summary = await this.nameCom.getDomainSummary(candidateZone);
        if (summary?.domainName) {
          const host = i === 0 ? "@" : parts.slice(0, i).join(".");
          return { zone: candidateZone, host };
        }
      } catch (error: unknown) {
        const serviceError = toDomainServiceError(error);
        if (serviceError.code === DOMAIN_ERROR_CODES.DOMAIN_NOT_FOUND) {
          continue;
        }
        throw serviceError;
      }
    }

    throw new DomainServiceError({
      code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
      message: "No platform-managed DNS zone found for the requested domain",
      details: { domain: fqdn },
    });
  }
}

function normalizeFqdn(fqdn: string): string {
  return fqdn.trim().toLowerCase().replace(/\.$/, "");
}

function normalizeHost(host: NameComRecord["host"]): string {
  if (!host || host === "") {
    return "@";
  }
  return host;
}

function toProviderHost(host: string): string {
  if (host === "@") {
    return "";
  }
  return host;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
