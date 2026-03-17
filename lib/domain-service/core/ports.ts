import type {
  AppRecord,
  DomainAuditContext,
  DomainOperation,
  DomainPurchaseRequest,
  DomainPurchaseRequestStatus,
  DomainRecord,
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
}

export interface DomainRegistrarPort {
  getDomainSummary(domainName: string): Promise<{ domainName: string; expiresAt?: string; createdAt?: string } | null>;
}

export interface DnsProviderPort {
  listTxtRecords(recordName: string): Promise<string[]>;
  ensureRoutingRecord(params: { fqdn: string; target: string; ttl: number }): Promise<void>;
  removeRoutingRecord(params: { fqdn: string; target?: string }): Promise<void>;
  ensureCnameRecord(params: { fqdn: string; target: string; ttl: number }): Promise<void>;
  removeCnameRecord(params: { fqdn: string; target?: string }): Promise<void>;
}

export interface IngressPort {
  addDomainToAppIngress(appName: string, domain: string): Promise<void>;
  removeDomainFromAppIngress(appName: string, domain: string): Promise<void>;
}

export interface AppReadPort {
  getOwnedApp(appId: string, userId: string): Promise<AppRecord>;
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
  updateStatus(params: {
    requestId: string;
    status: DomainPurchaseRequestStatus;
    providerRequestId?: string | null;
    lastError?: string | null;
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
