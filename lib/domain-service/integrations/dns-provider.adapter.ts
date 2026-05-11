import { Resolver } from "dns";
import {
  DOMAIN_ERROR_CODES,
  DomainServiceError,
  toDomainServiceError,
} from "@/lib/domain-service/core/errors";
import type { DnsProviderPort } from "@/lib/domain-service/core/ports";
import {
  DEFAULT_MANAGED_NAMESERVERS,
  NAMECOM_MANAGED_NAMESERVER_RE,
} from "@/lib/domain-service/managed-nameservers";
import {
  NameComRegistrarAdapter,
  type NameComRecord,
} from "@/lib/domain-service/integrations/namecom-registrar.adapter";

export class NameComDnsProviderAdapter implements DnsProviderPort {
  private readonly resolver: Resolver;

  constructor(private readonly nameCom: NameComRegistrarAdapter) {
    this.resolver = new Resolver();
    this.resolver.setServers(parsePublicDnsServers(process.env.DOMAINS_PUBLIC_DNS));
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
      const code = getErrorCode(error);
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

    // For apex domains (@) use a direct A record pointing to KUBE_IP so that
    // cert-manager's cluster-internal CoreDNS can resolve the domain during
    // the HTTP-01 ACME challenge (CoreDNS cannot follow ANAME/ALIAS).
    // For subdomains use a standard CNAME.
    const kubeIp = process.env.KUBE_IP;
    const isApex = host === "@";
    const recordType = isApex ? "A" : "CNAME";
    const answer = isApex && kubeIp ? kubeIp : params.target;

    if (isApex && !kubeIp) {
      // KUBE_IP is required for apex domains: cert-manager's HTTP-01 solver
      // resolves the domain inside the cluster via CoreDNS, which cannot follow
      // ANAME/ALIAS records. Without a real A record pointing to the ingress IP,
      // certificate issuance will fail silently. Treat this as a hard error so
      // the misconfiguration surfaces immediately rather than appearing to work
      // until the SSL stage.
      throw new Error(
        "[DnsProvider] KUBE_IP env var is not set. " +
          "An A record is required for apex domains so cert-manager can issue certificates. " +
          "Set KUBE_IP=<cluster-ingress-ip> and redeploy."
      );
    }

    const effectiveType = recordType;
    const effectiveAnswer = answer;
    const providerHost = toProviderHost(host);

    const list = await this.nameCom.listRecords(zone);
    const existing = list.records.find(
      (record) => record.type === effectiveType && normalizeHost(record.host) === normalizeHost(host)
    );

    if (existing?.answer === effectiveAnswer && Number(existing.ttl || 300) === ttl) {
      return;
    }

    // Remove all conflicting host-alias / address records before writing the desired type.
    const conflictTypes = new Set(["CNAME", "ANAME", "A"]);
    const conflicts = list.records.filter((record) => {
      if (normalizeHost(record.host) !== normalizeHost(host)) return false;
      return conflictTypes.has(record.type ?? "") && record.type !== effectiveType;
    });

    await Promise.all(
      conflicts
        .filter((record) => typeof record.id === "number")
        .map((record) => this.nameCom.deleteRecord(zone, Number(record.id)))
    );

    if (existing?.id != null) {
      const updated = await this.nameCom.updateRecord(zone, existing.id, {
        host: providerHost,
        type: effectiveType,
        answer: effectiveAnswer,
        ttl,
      });
      console.log("[DnsProvider] DNS record updated", {
        zone, host, type: effectiveType, answer: effectiveAnswer, id: updated.id,
      });
      return;
    }

    const created = await this.nameCom.createRecord(zone, {
      host: providerHost,
      type: effectiveType,
      answer: effectiveAnswer,
      ttl,
    });
    console.log("[DnsProvider] DNS record created", {
      zone, host, type: effectiveType, answer: effectiveAnswer, id: created.id,
    });
  }

  async removeRoutingRecord(params: { fqdn: string; target?: string }): Promise<void> {
    const { zone, host } = await this.resolveManagedZone(params.fqdn);
    const list = await this.nameCom.listRecords(zone);
    // For apex domains we may have written an A record (with IP) or an ANAME.
    const allowedTypes = host === "@" ? new Set(["A", "ANAME", "CNAME"]) : new Set(["CNAME"]);
    const apexIpTarget = host === "@" ? process.env.KUBE_IP : undefined;

    const matches = list.records.filter((record) => {
      if (!record.type || !allowedTypes.has(record.type)) return false;
      if (normalizeHost(record.host) !== normalizeHost(host)) return false;
      if (params.target) {
        const matchesConfiguredTarget = record.answer === params.target;
        const matchesApexIpTarget = Boolean(
          apexIpTarget && record.type === "A" && record.answer === apexIpTarget
        );
        if (!matchesConfiguredTarget && !matchesApexIpTarget) return false;
      }
      return true;
    });

    await Promise.all(
      matches
        .filter((record) => typeof record.id === "number")
        .map((record) => this.nameCom.deleteRecord(zone, Number(record.id)))
    );
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
        const domain = await this.nameCom.getDomain(candidateZone);
        // Name.com Core v1 returns HTTP 200 with the PARENT domain's data when
        // queried for a subdomain path (e.g. GET /domains/api.example.com returns
        // { domainName: "example.com" }). Guard against this: only treat the
        // candidate as a managed zone when the API confirms the exact name.
        if (
          domain?.domainName &&
          domain.domainName.toLowerCase() === candidateZone.toLowerCase()
        ) {
          // Domain is registered with Name.com — but only auto-manage DNS if the
          // nameservers are still pointing at the platform. When the user switches
          // to external nameservers, writing records to Name.com
          // has no effect because Name.com is no longer authoritative. In that
          // case we surface routing instructions so the user can add records
          // manually at their DNS provider.
          const nameservers = (domain.nameservers ?? [])
            .map((ns) => ns.trim().toLowerCase().replace(/\.$/, ""))
            .filter(Boolean);
          if (!isPlatformManagedNs(nameservers)) {
            throw new DomainServiceError({
              code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
              message: "No platform-managed DNS zone found: domain uses custom nameservers",
              details: { domain: fqdn, zone: candidateZone },
            });
          }
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

function isPlatformManagedNs(nameservers: string[]): boolean {
  // When Name.com returns no nameservers, assume the zone is still platform-managed
  // and let the DNS record write attempt proceed. If it fails because nameservers
  // were actually changed, the "NS not authoritative" safety net in
  // shouldSkipManagedDnsAutomation catches it and degrades gracefully.
  if (nameservers.length === 0) return true;
  return nameservers.every(
    (ns) => NAMECOM_MANAGED_NAMESERVER_RE.test(ns) || DEFAULT_MANAGED_NAMESERVERS.includes(ns)
  );
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

function parsePublicDnsServers(raw?: string): string[] {
  const configured = raw
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (configured && configured.length > 0) {
    return configured;
  }
  // Cloudflare (1.1.1.1) first: it has far shorter negative-cache TTLs than
  // Google (8.8.8.8). When a record is newly created, 8.8.8.8 can cache
  // NXDOMAIN for up to 3600 s (SOA minimum TTL), blocking cert-manager's
  // HTTP-01 self-check even after the DNS record exists.
  return ["1.1.1.1", "8.8.8.8"];
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  if (!("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
