// ─── Shared types & helpers for the domain detail page ───────────────────────

export { operationFailureFallback } from '@/components/dashboard/apps/custom-domains/utils';

export interface AppListItem {
  id: string;
  name: string;
  status: string;
}

export interface DomainPurchase {
  id: string;
  app_id: string | null;
  status: 'requested' | 'processing' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  last_error: string | null;
}

export interface DomainConnection {
  id: string;
  app_id: string;
  app_name: string;
  app_slug: string;
  app_status: string;
  domain: string;
  status: 'pending' | 'verified' | 'active' | 'failed' | 'removed';
  ssl_status: 'pending' | 'issuing' | 'active' | 'failed';
  is_primary: boolean;
  verification_token: string;
  routing_target: string;
  routing_ips: string[];
  last_error: string | null;
  created_at: string;
}

export interface DomainInventoryItem {
  domain: string;
  purchase: DomainPurchase | null;
  connections: DomainConnection[];
  source: 'purchased' | 'external' | 'mixed';
  expires_at: string | null;
  auto_renew: boolean | null;
}

export interface DomainConnectionItem {
  id: string;
  appId: string;
  appName: string;
  appSlug: string;
  appStatus: string;
  domain: string;
  hostLabel: string;
  status: DomainConnection['status'];
  sslStatus: DomainConnection['ssl_status'];
  isPrimary: boolean;
  verificationToken: string;
  routingTarget: string;
  routingIps: string[];
  lastError: string | null;
  /** Populated after a manual check-ssl call. undefined = not yet checked. */
  dnsReady?: boolean;
  dnsMessage?: string;
}

export interface DnsRecordItem {
  id: number | null;
  host: string;
  type: string;
  answer: string;
  ttl: number;
  priority: number | null;
  fqdn: string | null;
}

export type DnsRecordType = 'A' | 'AAAA' | 'ANAME' | 'CNAME' | 'TXT' | 'MX' | 'NS' | 'SRV';

export interface DnsFormState {
  recordId: number | null;
  type: DnsRecordType;
  host: string;
  answer: string;
  ttl: number;
  priority: string;
}

export interface RegistrarSettings {
  domain: string;
  managed: boolean;
  zone: string | null;
  host: string | null;
  autorenew_enabled: boolean | null;
  locked: boolean | null;
  privacy_enabled: boolean | null;
  expires_at: string | null;
  nameservers: string[];
}

// ─── Error helpers ────────────────────────────────────────────────────────────

export const API_ERROR_MESSAGES: Record<string, string> = {
  DOMAIN_LIMIT_REACHED: "You've reached the maximum number of domains for this app.",
  DOMAIN_ALREADY_EXISTS: 'This domain is already connected to an app.',
  DOMAIN_ALREADY_IN_USE: 'This domain is already in use by another app.',
  NOT_FOUND: 'Domain not found — it may have already been removed.',
  DOMAIN_NOT_MANAGED: "This domain isn't managed through your account.",
  DOMAIN_NOT_VERIFIED: 'Domain must be verified before activation.',
  OPERATION_IN_PROGRESS: 'Another setup operation is already running for this domain. Please wait.',
  PROVIDER_RATE_LIMITED: 'The provider rate-limited this request. Please wait and try again.',
  INGRESS_APPLY_FAILED: 'Domain setup failed in infrastructure. Please retry in a moment.',
  INTEGRATION_CONFIG_ERROR: 'Platform integration is not fully configured. Contact support if this persists.',
  TOO_MANY_REQUESTS: 'Too many requests — please wait a moment and try again.',
  INTERNAL_ERROR: 'Something went wrong on our end. Please try again.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: "You don't have permission to do that.",
  VALIDATION_ERROR: 'Please check your input and try again.',
};

export function looksInternal(msg: string): boolean {
  return /supabase|postgres|sql[\s(]|stack trace|node_modules|\.ts:\d|undefined is not|cannot read property|fetch failed|econnrefused|503|500 internal|jenkins|kubernetes|ingress|cert-manager|clusterissuer/i.test(
    msg,
  );
}

export function friendlyError(
  data: Record<string, unknown> | null | undefined,
  fallback: string,
): string {
  const code = typeof data?.error === 'string' ? data.error : '';
  const message = typeof data?.message === 'string' ? data.message : '';
  if (code === 'PROVIDER_RATE_LIMITED' && message && !looksInternal(message)) return message;
  if (code && API_ERROR_MESSAGES[code]) return API_ERROR_MESSAGES[code];
  if (message && !looksInternal(message)) return message;
  return fallback;
}

export function sanitizeOperationError(
  msg: string | undefined | null,
  fallback: string,
): string {
  if (!msg) return fallback;
  if (looksInternal(msg)) return fallback;
  return msg;
}

export function sanitizeLastError(msg: string | null): string | null {
  if (!msg) return null;
  if (looksInternal(msg))
    return 'There was an issue with this connection. Contact support if it persists.';
  return msg;
}

export type RelatedDomainRole = 'parent' | 'subdomain' | 'sibling';

export interface RelatedDomain {
  domain: string;
  role: RelatedDomainRole;
}

export function normalizeDomain(value: string): string {
  return value.trim().toLowerCase();
}

export function hostLabelFor(domain: string, root: string): string {
  if (domain === root) return '@';
  const suffix = `.${root}`;
  if (domain.endsWith(suffix)) return domain.slice(0, -suffix.length);
  return domain;
}
