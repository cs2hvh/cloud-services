import type {
  AppRecord,
  DomainAuditContext,
  DomainOperation,
  DomainPurchaseRequest,
  DomainPurchaseRequestStatus,
  DomainRecord,
  DomainTransferRequest,
  DomainTransferRequestStatus,
} from "@/lib/domain-service/core/types";

export interface DomainMarketplaceResultRecord {
  domainName: string;
  purchasable: boolean;
  premium?: boolean;
  purchasePrice?: number;
  renewalPrice?: number;
  purchaseType?: string;
  reason?: string;
}

export interface DomainMarketplaceRegistrarPort {
  checkAvailability(domainNames: string[]): Promise<{
    results: DomainMarketplaceResultRecord[];
  }>;
  searchDomains(input: {
    keyword: string;
    timeout?: number;
    tldFilter?: string[];
  }): Promise<{
    results: DomainMarketplaceResultRecord[];
  }>;
  purchaseDomain(
    input: {
      domainName: string;
      purchasePrice?: number;
      purchaseType?: string;
    },
    options?: { idempotencyKey?: string }
  ): Promise<{
    order?: number;
    totalPaid?: number;
  }>;
  /**
   * Optional: Update the registrant contact on a domain after purchase.
   * Used for white-label flows so ICANN contact verification emails are
   * routed to the purchasing user rather than the platform admin account.
   * Implementations may be no-ops if the provider does not support it.
   */
  setRegistrantContact?(
    domainName: string,
    contact: { email: string; firstName?: string; lastName?: string }
  ): Promise<void>;
}

export interface DomainRegistrarPort {
  getDomainSummary(domainName: string): Promise<{ domainName: string; expiresAt?: string; createdAt?: string } | null>;
}

export interface DnsProviderPort {
  listTxtRecords(recordName: string): Promise<string[]>;
  ensureRoutingRecord(params: { fqdn: string; target: string; ttl: number }): Promise<void>;
  removeRoutingRecord(params: { fqdn: string; target?: string }): Promise<void>;
}

/**
 * Probes the live TLS certificate of a publicly reachable hostname.
 * Decoupled from ingress management — can be backed by a Node.js TLS socket,
 * an HTTP-based checker, or any other implementation.
 */
export interface TlsCertInfo {
  /** Lowercased JSON of the certificate issuer object. */
  issuer: string;
  /** Lowercased certificate CN when present. */
  common_name?: string;
  /** Lowercased DNS SAN entries (without the `DNS:` prefix). */
  sans?: string[];
}

export interface SslProbePort {
  /** Returns null if the host is unreachable or presents no certificate. */
  probe(hostname: string): Promise<TlsCertInfo | null>;
}

export interface IngressPort {
  addDomainToAppIngress(appName: string, domain: string): Promise<void>;
  removeDomainFromAppIngress(appName: string, domain: string): Promise<void>;
}

export interface AppReadPort {
  getOwnedApp(appId: string, userId: string): Promise<AppRecord>;
}

export interface AppWritePort {
  setHasCustomDomains(appId: string, hasCustomDomains: boolean): Promise<void>;
  clearCustomDomain(appId: string, clearedDomain: string): Promise<void>;
  setPrimaryCustomDomain(appId: string, domain: string): Promise<void>;
}

export interface DnsRoutingPort {
  getRoutingStatus(domain: string): Promise<import("./types").DnsRoutingStatus>;
}

export interface DomainRepositoryPort {
  listByApp(appId: string, userId: string): Promise<DomainRecord[]>;
  findByIdForUser(domainId: string, userId: string): Promise<DomainRecord | null>;
  findActiveByDomain(domain: string): Promise<DomainRecord | null>;
  createPending(params: {
    appId: string;
    userId: string;
    domain: string;
    verificationToken: string;
  }): Promise<DomainRecord>;
  markVerified(domainId: string): Promise<DomainRecord>;
  markActive(domainId: string): Promise<DomainRecord>;
  markRemoved(domainId: string): Promise<void>;
  setPrimary(
    domainId: string,
    appId: string,
    options?: { redirectToPrimary?: boolean }
  ): Promise<DomainRecord>;
  updateLastError(domainId: string, message: string | null): Promise<void>;
  updateSslStatus(domainId: string, status: "pending" | "issuing" | "active" | "failed"): Promise<void>;
}

export interface DomainOperationRepositoryPort {
  create(params: {
    userId: string;
    action: string;
    domainId?: string | null;
    idempotencyKey?: string | null;
    requestData?: Record<string, unknown>;
    status?: "pending" | "running" | "succeeded" | "failed";
    responseData?: Record<string, unknown> | null;
  }): Promise<DomainOperation>;
  findByIdForUser(operationId: string, userId: string): Promise<DomainOperation | null>;
  findByIdempotencyKey(params: {
    userId: string;
    action: string;
    idempotencyKey: string;
  }): Promise<DomainOperation | null>;
  markRunning(operationId: string): Promise<void>;
  markSucceeded(operationId: string, responseData?: Record<string, unknown>): Promise<void>;
  markFailed(params: {
    operationId: string;
    code: string;
    message: string;
    retryable: boolean;
  }): Promise<void>;
}

export interface DomainPurchaseRequestRepositoryPort {
  create(params: {
    userId: string;
    appId?: string | null;
    domain: string;
    purchasePrice?: number | null;
    renewalPrice?: number | null;
    currency?: string;
    provider?: string;
    idempotencyKey?: string | null;
    providerRequestId?: string | null;
    metadata?: Record<string, unknown>;
    status?: DomainPurchaseRequestStatus;
  }): Promise<DomainPurchaseRequest>;
  findByIdForUser(requestId: string, userId: string): Promise<DomainPurchaseRequest | null>;
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<DomainPurchaseRequest | null>;
  findLatestByDomain(params: {
    userId: string;
    domain: string;
  }): Promise<DomainPurchaseRequest | null>;
  listByUser(params: {
    userId: string;
    appId?: string;
    limit?: number;
  }): Promise<DomainPurchaseRequest[]>;
  /**
   * Returns completed purchase requests where registrant_email is NULL.
   * Used by the reconciliation cron to retry failed setRegistrantContact calls.
   * Only looks at records created within the last 20 days (ICANN window is 15 days).
   */
  findUnsyncedCompleted(limit: number): Promise<DomainPurchaseRequest[]>;
  updateStatus(params: {
    requestId: string;
    status: DomainPurchaseRequestStatus;
    providerRequestId?: string | null;
    lastError?: string | null;
    registrantEmail?: string | null;
  }): Promise<void>;
}

export interface DomainBillingPort {
  chargeDomainPurchase(params: {
    userId: string;
    purchaseRequestId: string;
    domain: string;
    amount: number;
    currency: string;
  }): Promise<void>;
  refundDomainPurchase(params: {
    userId: string;
    purchaseRequestId: string;
    domain: string;
    amount: number;
    currency: string;
    reason: string;
  }): Promise<void>;
}

export interface DomainAuditLogPort {
  log(params: {
    userId: string;
    userEmail?: string;
    userName?: string;
    userRole?: "user" | "admin" | "system";
    action: "create" | "update" | "delete";
    serviceId?: string;
    serviceName?: string;
    metadata?: Record<string, unknown>;
    context?: DomainAuditContext;
  }): Promise<void>;
}

export interface DomainNotificationPort {
  notify(params: {
    userId: string;
    action: "created" | "updated" | "deleted" | "attached" | "failed";
    serviceName: string;
    serviceId?: string;
    type?: "success" | "info" | "warning" | "error";
    error?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

export interface DomainEmailPort {
  sendImportantEvent(params: {
    to: string;
    customerName?: string;
    severity: "info" | "warning" | "critical";
    alertTitle: string;
    serviceName: string;
    summary: string;
    metadata?: Record<string, string | number | boolean>;
    actionUrl?: string;
    actionLabel?: string;
  }): Promise<void>;
}

/* ──────────────────────────────────────────────────────────
 * Domain Transfer Ports
 * ──────────────────────────────────────────────────────────*/

export interface NameComTransferResponse {
  domainName: string;
  email?: string;
  status: string;
}

export interface NameComCreateTransferResponse {
  transfer: NameComTransferResponse;
  order?: number;
  totalPaid?: number;
}

export interface DomainTransferRegistrarPort {
  checkAvailability(domainNames: string[]): Promise<{
    results: DomainMarketplaceResultRecord[];
  }>;

  createTransfer(input: {
    domainName: string;
    authCode: string;
    purchasePrice?: number;
    privacyEnabled?: boolean;
  }): Promise<NameComCreateTransferResponse>;

  getTransfer(domainName: string): Promise<NameComTransferResponse>;

  cancelTransfer(domainName: string): Promise<NameComTransferResponse>;

  listTransfers(params?: {
    page?: number;
    perPage?: number;
  }): Promise<{ transfers: NameComTransferResponse[] }>;
}

export interface DomainTransferRequestRepositoryPort {
  create(params: {
    userId: string;
    domain: string;
    authCodeHash?: string | null;
    purchasePrice?: number | null;
    renewalPrice?: number | null;
    currency?: string;
    provider?: string;
    providerOrderId?: string | null;
    providerStatus?: string | null;
    providerEmail?: string | null;
    idempotencyKey?: string | null;
    metadata?: Record<string, unknown>;
    status?: DomainTransferRequestStatus;
  }): Promise<DomainTransferRequest>;

  findByIdForUser(requestId: string, userId: string): Promise<DomainTransferRequest | null>;

  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<DomainTransferRequest | null>;

  findActiveByDomain(domain: string): Promise<DomainTransferRequest | null>;

  listByUser(params: {
    userId: string;
    limit?: number;
  }): Promise<DomainTransferRequest[]>;

  listPendingForPolling(params: {
    limit?: number;
    staleBefore?: string;
  }): Promise<DomainTransferRequest[]>;

  updateStatus(params: {
    requestId: string;
    status: DomainTransferRequestStatus;
    providerOrderId?: string | null;
    providerStatus?: string | null;
    providerEmail?: string | null;
    lastError?: string | null;
    failureReason?: string | null;
  }): Promise<void>;

  updatePolled(requestId: string): Promise<void>;

  clearAuthCode(requestId: string): Promise<void>;
}
