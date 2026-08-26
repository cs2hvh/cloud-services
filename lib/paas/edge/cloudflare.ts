/**
 * Cloudflare edge: DNS records, custom hostnames and certificates.
 *
 * The edge design in one line: Cloudflare terminates all public TLS, so we
 * never issue a certificate per app. v1 issued one Let's Encrypt certificate
 * per app on a shared apex, which caps growth at roughly 50 new apps a week.
 *
 * Two hostname classes:
 *   - Platform hostnames (`<app>.<appDomain>`) are covered by ONE wildcard
 *     record + certificate. They cost zero custom hostnames, which is the
 *     single biggest cost avoidance in the design.
 *   - Customer BYO domains become Cloudflare for SaaS custom hostnames,
 *     $0.10/month each past the first 100, with a 50,000 self-serve ceiling.
 */

import { paasConfig } from "../config.ts";

const CF_API = "https://api.cloudflare.com/client/v4";

export interface CfResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: unknown[];
  result: T;
}

export class CloudflareError extends Error {
  status: number;
  errors: Array<{ code: number; message: string }>;

  constructor(message: string, status: number, errors: Array<{ code: number; message: string }> = []) {
    super(message);
    this.name = "CloudflareError";
    this.status = status;
    this.errors = errors;
  }
}

async function cf<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${paasConfig.cloudflare.apiToken()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as CfResponse<T> | null;
  if (!res.ok || !body?.success) {
    const errs = body?.errors ?? [];
    throw new CloudflareError(
      `[cloudflare] ${init?.method ?? "GET"} ${path} -> ${res.status}: ${
        errs.map((e) => `${e.code} ${e.message}`).join("; ") || "unknown error"
      }`,
      res.status,
      errs,
    );
  }
  return body.result;
}

// ── token / zone ────────────────────────────────────────────────────────────

export function verifyToken(): Promise<{ id: string; status: string }> {
  return cf<{ id: string; status: string }>("/user/tokens/verify");
}

export interface Zone {
  id: string;
  name: string;
  status: string;
  plan?: { name: string };
}

export function getZone(): Promise<Zone> {
  return cf<Zone>(`/zones/${paasConfig.cloudflare.zoneId()}`);
}

// ── DNS ─────────────────────────────────────────────────────────────────────

export interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

export function listDnsRecords(nameContains?: string): Promise<DnsRecord[]> {
  const q = nameContains ? `?name.contains=${encodeURIComponent(nameContains)}&per_page=100` : "?per_page=100";
  return cf<DnsRecord[]>(`/zones/${paasConfig.cloudflare.zoneId()}${`/dns_records${q}`}`);
}

/**
 * Create or update a DNS record.
 *
 * v2 creates exactly ONE wildcard record for the whole platform, proxied, and
 * never a record per app. v1 created a per-app unproxied A record pointing at a
 * single hardcoded KUBE_IP — which meant the origin IP lived in customer DNS
 * and the platform could never move, scale or fail over.
 */
export async function upsertDnsRecord(input: {
  type: "A" | "AAAA" | "CNAME";
  name: string;
  content: string;
  proxied?: boolean;
  ttl?: number;
}): Promise<DnsRecord> {
  const zoneId = paasConfig.cloudflare.zoneId();
  const existing = (await listDnsRecords(input.name)).find((r) => r.name === input.name);
  const body = JSON.stringify({
    type: input.type,
    name: input.name,
    content: input.content,
    proxied: input.proxied ?? true,
    ttl: input.ttl ?? 1, // 1 = automatic
  });
  if (existing) {
    return cf<DnsRecord>(`/zones/${zoneId}/dns_records/${existing.id}`, { method: "PUT", body });
  }
  return cf<DnsRecord>(`/zones/${zoneId}/dns_records`, { method: "POST", body });
}

export function deleteDnsRecord(id: string): Promise<{ id: string }> {
  return cf<{ id: string }>(`/zones/${paasConfig.cloudflare.zoneId()}/dns_records/${id}`, {
    method: "DELETE",
  });
}

// ── certificates ────────────────────────────────────────────────────────────

export interface CertificatePack {
  id: string;
  type: string;
  hosts: string[];
  status: string;
  certificate_authority?: string;
}

export function listCertificatePacks(): Promise<CertificatePack[]> {
  return cf<CertificatePack[]>(
    `/zones/${paasConfig.cloudflare.zoneId()}/ssl/certificate_packs?status=all`,
  );
}

/**
 * Does an existing certificate cover this hostname?
 *
 * Wildcards match exactly ONE label, so `*.ahurasense.com` covers
 * `app.ahurasense.com` but NOT `app.apps.ahurasense.com`. This is the check
 * that decides whether Advanced Certificate Manager is actually required.
 */
export function certCovers(packs: CertificatePack[], hostname: string): boolean {
  return packs.some((p) =>
    p.hosts.some((h) => {
      if (h === hostname) return true;
      if (!h.startsWith("*.")) return false;
      const suffix = h.slice(1); // ".example.com"
      if (!hostname.endsWith(suffix)) return false;
      const label = hostname.slice(0, hostname.length - suffix.length);
      return label.length > 0 && !label.includes(".");
    }),
  );
}

// ── Cloudflare for SaaS: customer domains ───────────────────────────────────

export interface CustomHostname {
  id: string;
  hostname: string;
  status: string;
  ssl: { status: string; method: string; validation_records?: unknown[] };
  verification_errors?: string[];
}

export function listCustomHostnames(hostname?: string): Promise<CustomHostname[]> {
  const q = hostname ? `?hostname=${encodeURIComponent(hostname)}` : "?per_page=50";
  return cf<CustomHostname[]>(`/zones/${paasConfig.cloudflare.zoneId()}/custom_hostnames${q}`);
}

/**
 * Register a customer's own domain. `txt` DCV is used rather than `http`
 * because it can be validated BEFORE the customer switches DNS, which makes
 * cutover zero-downtime.
 */
export function createCustomHostname(hostname: string): Promise<CustomHostname> {
  return cf<CustomHostname>(`/zones/${paasConfig.cloudflare.zoneId()}/custom_hostnames`, {
    method: "POST",
    body: JSON.stringify({
      hostname,
      ssl: { method: "txt", type: "dv", settings: { min_tls_version: "1.2" } },
    }),
  });
}

export function deleteCustomHostname(id: string): Promise<unknown> {
  return cf<unknown>(`/zones/${paasConfig.cloudflare.zoneId()}/custom_hostnames/${id}`, {
    method: "DELETE",
  });
}

/**
 * The fallback origin — where a customer's domain lands before anything else.
 *
 * Cloudflare for SaaS REFUSES to add any custom hostname until this is set, and
 * refuses to complete verification until it is active. It must be a PROXIED
 * record inside our own zone, because it is the origin Cloudflare connects to
 * after terminating TLS for the customer's domain.
 *
 * It does not decide which app a request reaches. The Ingress does that, off the
 * Host header, exactly as it does for an `*.ahurasense.com` hostname — the
 * fallback origin only gets the request into the cluster. So one fallback origin
 * serves every customer domain, and adding a customer does not change it.
 */
export function getFallbackOrigin(): Promise<{ origin?: string; status?: string }> {
  return cf<{ origin?: string; status?: string }>(
    `/zones/${paasConfig.cloudflare.zoneId()}/custom_hostnames/fallback_origin`,
  );
}

export function setFallbackOrigin(origin: string): Promise<{ origin?: string; status?: string }> {
  return cf<{ origin?: string; status?: string }>(
    `/zones/${paasConfig.cloudflare.zoneId()}/custom_hostnames/fallback_origin`,
    { method: "PUT", body: JSON.stringify({ origin }) },
  );
}
