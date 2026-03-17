import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";
import type {
  AppReadPort,
  DomainAuditLogPort,
  DomainBillingPort,
  DomainEmailPort,
  DomainMarketplaceRegistrarPort,
  DomainNotificationPort,
  DomainPurchaseRequestRepositoryPort,
} from "@/lib/domain-service/core/ports";
import type { ActorContext, DomainPurchaseRequest } from "@/lib/domain-service/core/types";

export interface DomainMarketplaceSummary {
  channel: "ahuracloud";
  configured: boolean;
  mode: "managed_reseller";
  capabilities: {
    search: true;
    purchase_requests: true;
    auto_fulfillment: boolean;
  };
  notes: string;
}

export interface DomainMarketplaceResult {
  domainName: string;
  available: boolean;
  premium: boolean;
  purchasePrice: number | null;
  renewalPrice: number | null;
  currency: string;
  purchaseType: string | null;
  reason: string | null;
  fulfillment: "ahuracloud";
}

export interface DomainSearchResponse {
  channel: "ahuracloud";
  query: string;
  results: DomainMarketplaceResult[];
}

const DEFAULT_TLDS = ["com", "net", "io", "app", "dev", "org"];

export class DomainMarketplaceService {
  private readonly deps: {
    billing?: DomainBillingPort;
    audit?: DomainAuditLogPort;
    notifications?: DomainNotificationPort;
    email?: DomainEmailPort;
  };

  constructor(
    private readonly registrar: DomainMarketplaceRegistrarPort,
    private readonly appRead: AppReadPort,
    private readonly purchaseRequests: DomainPurchaseRequestRepositoryPort,
    deps: {
      billing?: DomainBillingPort;
      audit?: DomainAuditLogPort;
      notifications?: DomainNotificationPort;
      email?: DomainEmailPort;
    } = {}
  ) {
    this.deps = deps;
  }

  getSummary(): DomainMarketplaceSummary {
    const configured = Boolean(process.env.NAMECOM_USERNAME && process.env.NAMECOM_API_TOKEN)
      || Boolean(process.env.NAMECOM_BASIC_AUTH);

    return {
      channel: "ahuracloud",
      configured,
      mode: "managed_reseller",
      capabilities: {
        search: true,
        purchase_requests: true,
        auto_fulfillment: true,
      },
      notes: configured
        ? "Domain purchases are completed through AhuraCloud using our registrar backend."
        : "Marketplace is not fully configured. Set reseller credentials to enable search and request processing.",
    };
  }

  async search(input: {
    query: string;
    tlds?: string[];
  }): Promise<DomainSearchResponse> {
    const query = input.query.trim().toLowerCase();
    if (!query) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
        message: "Query is required",
      });
    }

    const hasDot = query.includes(".");
    const tlds = sanitizeTlds(input.tlds);

    let results: DomainMarketplaceResult[] = [];

    if (hasDot) {
      const normalized = normalizeDomainCandidate(query);
      const data = await this.registrar.checkAvailability([normalized]);
      results = (data.results || []).map((item) => toMarketplaceResult(item));
    } else {
      const data = await this.registrar.searchDomains({
        keyword: query,
        timeout: 2500,
        tldFilter: tlds,
      });

      results = (data.results || []).slice(0, 20).map((item) => toMarketplaceResult(item));

      if (results.length === 0) {
        const generated = buildCandidateDomains(query, tlds);
        const fallback = await this.registrar.checkAvailability(generated);
        results = (fallback.results || []).map((item) => toMarketplaceResult(item));
      }
    }

    return {
      channel: "ahuracloud",
      query,
      results,
    };
  }

  async createPurchaseRequest(input: {
    actor: ActorContext;
    appId?: string;
    domain: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }): Promise<DomainPurchaseRequest> {
    const cleanDomain = normalizeDomainCandidate(input.domain);
    ensureDomainFormat(cleanDomain);
    const actor = input.actor;

    if (input.appId) {
      await this.appRead.getOwnedApp(input.appId, input.actor.userId);
    }

    const existingByDomain = await this.purchaseRequests.findLatestByDomain({
      userId: input.actor.userId,
      domain: cleanDomain,
    });
    if (existingByDomain && isBlockingPurchaseStatus(existingByDomain.status)) {
      return toPublicPurchaseRequest(existingByDomain);
    }

    if (input.idempotencyKey) {
      const existing = await this.purchaseRequests.findByIdempotencyKey(
        input.actor.userId,
        input.idempotencyKey
      );
      if (existing) {
        if ((existing.app_id || null) !== (input.appId || null) || existing.domain !== cleanDomain) {
          throw new DomainServiceError({
            code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
            message: "Idempotency key already used with a different purchase request payload",
            details: {
              idempotency_key: input.idempotencyKey,
              existing_request_id: existing.id,
            },
          });
        }
        return toPublicPurchaseRequest(existing);
      }
    }

    const check = await this.registrar.checkAvailability([cleanDomain]);
    const first = check.results?.[0];

    if (!first || first.domainName !== cleanDomain) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.PROVIDER_VALIDATION_FAILED,
        message: "Registrar availability check did not return expected domain data",
        details: { domain: cleanDomain },
      });
    }

    if (!first.purchasable) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_NOT_AVAILABLE,
        message: `Domain ${cleanDomain} is not available for registration`,
        details: { domain: cleanDomain, reason: first.reason || null },
      });
    }

    const request = await this.purchaseRequests.create({
      userId: input.actor.userId,
      appId: input.appId || null,
      domain: cleanDomain,
      purchasePrice: first.purchasePrice ?? null,
      renewalPrice: first.renewalPrice ?? null,
      currency: "USD",
      provider: "namecom",
      idempotencyKey: input.idempotencyKey || null,
      providerRequestId: null,
      metadata: {
        purchase_type: first.purchaseType || null,
        premium: Boolean(first.premium),
        ...(input.metadata || {}),
      },
      status: "processing",
    });

    let chargedAmount = 0;
    try {
      const purchasePrice = Number(first.purchasePrice || 0);
      if (purchasePrice > 0 && this.deps.billing) {
        await this.deps.billing.chargeDomainPurchase({
          userId: input.actor.userId,
          purchaseRequestId: request.id,
          domain: cleanDomain,
          amount: purchasePrice,
          currency: "USD",
        });
        chargedAmount = purchasePrice;
      }
    } catch (error: unknown) {
      const serviceError = error instanceof DomainServiceError
        ? error
        : new DomainServiceError({
            code: DOMAIN_ERROR_CODES.BILLING_CHARGE_FAILED,
            message: error instanceof Error ? error.message : "Domain billing charge failed",
          });

      await this.purchaseRequests.updateStatus({
        requestId: request.id,
        status: "failed",
        lastError: serviceError.message,
      });

      await this.emitFailureEvents({
        actor,
        requestId: request.id,
        domain: cleanDomain,
        appId: input.appId,
        error: serviceError,
        event: "domain_purchase_billing_failed",
      });

      throw serviceError;
    }

    let purchase: Awaited<ReturnType<DomainMarketplaceRegistrarPort["purchaseDomain"]>>;
    try {
      purchase = await this.registrar.purchaseDomain(
        {
          domainName: cleanDomain,
          purchasePrice: first.purchasePrice ?? undefined,
          purchaseType: first.purchaseType ?? undefined,
        },
        {
          idempotencyKey: input.idempotencyKey,
        }
      );
    } catch (error: unknown) {
      const rawError = error instanceof DomainServiceError
        ? error
        : new DomainServiceError({
            code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
            message: error instanceof Error ? error.message : "Unknown purchase error",
          });
      const serviceError = (
        rawError.code === DOMAIN_ERROR_CODES.PROVIDER_VALIDATION_FAILED
        && /already|registered|unavailable|not available|taken/i.test(rawError.message)
      )
        ? new DomainServiceError({
            code: DOMAIN_ERROR_CODES.DOMAIN_NOT_AVAILABLE,
            message: `Domain ${cleanDomain} is no longer available for registration`,
            details: { domain: cleanDomain },
          })
        : rawError;

      await this.purchaseRequests.updateStatus({
        requestId: request.id,
        status: "failed",
        lastError: serviceError.message,
      });

      if (chargedAmount > 0 && this.deps.billing) {
        await this.emitNonBlocking(async () => {
          await this.deps.billing!.refundDomainPurchase({
            userId: input.actor.userId,
            purchaseRequestId: request.id,
            domain: cleanDomain,
            amount: chargedAmount,
            currency: "USD",
            reason: "purchase_failed",
          });
        });
      }

      await this.emitFailureEvents({
        actor,
        requestId: request.id,
        domain: cleanDomain,
        appId: input.appId,
        error: serviceError,
        event: "domain_purchase_failed",
      });

      throw serviceError;
    }

    await this.purchaseRequests.updateStatus({
      requestId: request.id,
      status: "completed",
      providerRequestId: purchase.order ? String(purchase.order) : null,
      lastError: null,
    });

    await this.emitNonBlocking(async () => {
      await this.emitAudit({
        actor,
        action: "create",
        serviceId: request.id,
        serviceName: cleanDomain,
        metadata: {
          event: "domain_purchase_completed",
          source_app_id: input.appId || null,
          provider: "ahuracloud",
          provider_order_id: purchase.order ? String(purchase.order) : null,
          amount: first.purchasePrice ?? null,
          currency: "USD",
        },
      });
      await this.emitNotification({
        userId: input.actor.userId,
        action: "created",
        serviceName: cleanDomain,
        serviceId: request.id,
        type: "success",
        metadata: {
          event: "domain_purchase_completed",
          source_app_id: input.appId || null,
          amount: first.purchasePrice ?? null,
          renewal_price: first.renewalPrice ?? null,
          currency: "USD",
        },
      });
      await this.emitEmail({
        actor,
        severity: "info",
        alertTitle: "Domain purchase completed",
        serviceName: cleanDomain,
        summary: `Your domain purchase for ${cleanDomain} has completed successfully.`,
        metadata: {
          source_app_id: input.appId || "none",
          amount: first.purchasePrice ?? 0,
          charged: chargedAmount,
        },
      });
    });

    return toPublicPurchaseRequest({
      ...request,
      status: "completed",
      provider_request_id: purchase.order ? String(purchase.order) : null,
      last_error: null,
    });
  }

  async listPurchaseRequests(input: {
    actor: ActorContext;
    appId?: string;
    limit?: number;
  }): Promise<DomainPurchaseRequest[]> {
    if (input.appId) {
      await this.appRead.getOwnedApp(input.appId, input.actor.userId);
    }

    const requests = await this.purchaseRequests.listByUser({
      userId: input.actor.userId,
      appId: input.appId,
      limit: input.limit || 20,
    });
    return requests.map(toPublicPurchaseRequest);
  }

  async getPurchaseRequest(input: {
    actor: ActorContext;
    requestId: string;
  }): Promise<DomainPurchaseRequest> {
    const request = await this.purchaseRequests.findByIdForUser(input.requestId, input.actor.userId);

    if (!request) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.PURCHASE_REQUEST_NOT_FOUND,
        message: "Domain purchase request not found",
      });
    }

    return toPublicPurchaseRequest(request);
  }

  private async emitFailureEvents(params: {
    actor: ActorContext;
    requestId: string;
    domain: string;
    appId?: string;
    error: DomainServiceError;
    event: string;
  }): Promise<void> {
    await this.emitNonBlocking(async () => {
      await this.emitAudit({
        actor: params.actor,
        action: "update",
        serviceId: params.requestId,
        serviceName: params.domain,
        metadata: {
          event: params.event,
          source_app_id: params.appId || null,
          error_code: params.error.code,
          error_message: params.error.message,
        },
      });
      await this.emitNotification({
        userId: params.actor.userId,
        action: "failed",
        serviceName: params.domain,
        serviceId: params.requestId,
        type: "error",
        error: params.error.message,
        metadata: {
          event: params.event,
          source_app_id: params.appId || null,
          error_code: params.error.code,
        },
      });
      await this.emitEmail({
        actor: params.actor,
        severity: "warning",
        alertTitle: "Domain purchase failed",
        serviceName: params.domain,
        summary: `Domain purchase failed for ${params.domain}: ${params.error.message}`,
        metadata: {
          source_app_id: params.appId || "none",
          error_code: params.error.code,
        },
      });
    });
  }

  private async emitAudit(params: {
    actor: ActorContext;
    action: "create" | "update" | "delete";
    serviceId?: string;
    serviceName?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.deps.audit) return;
    await this.deps.audit.log({
      userId: params.actor.userId,
      userEmail: params.actor.userEmail,
      userName: params.actor.userName,
      userRole: params.actor.userRole || "user",
      action: params.action,
      serviceId: params.serviceId,
      serviceName: params.serviceName,
      metadata: params.metadata,
      context: params.actor.auditContext,
    });
  }

  private async emitNotification(params: {
    userId: string;
    action: "created" | "updated" | "deleted" | "attached" | "failed";
    serviceName: string;
    serviceId?: string;
    type?: "success" | "info" | "warning" | "error";
    error?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.deps.notifications) return;
    await this.deps.notifications.notify(params);
  }

  private async emitEmail(params: {
    actor: ActorContext;
    severity: "info" | "warning" | "critical";
    alertTitle: string;
    serviceName: string;
    summary: string;
    metadata?: Record<string, string | number | boolean>;
  }): Promise<void> {
    if (!this.deps.email || !params.actor.userEmail) return;
    await this.deps.email.sendImportantEvent({
      to: params.actor.userEmail,
      customerName: params.actor.userName,
      severity: params.severity,
      alertTitle: params.alertTitle,
      serviceName: params.serviceName,
      summary: params.summary,
      metadata: params.metadata,
    });
  }

  private async emitNonBlocking(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error) {
      console.warn("[DomainMarketplaceService] Observability event failed", error);
    }
  }
}

function sanitizeTlds(tlds?: string[]): string[] {
  if (!tlds || tlds.length === 0) {
    return DEFAULT_TLDS;
  }

  return tlds
    .map((tld) => tld.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean)
    .slice(0, 15);
}

function buildCandidateDomains(query: string, tlds: string[]): string[] {
  const clean = query.replace(/[^a-z0-9-]/g, "");
  if (!clean) return [];
  return tlds.map((tld) => `${clean}.${tld}`).slice(0, 50);
}

function normalizeDomainCandidate(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .replace(/\/.*$/, "");
}

function ensureDomainFormat(domain: string): void {
  const domainRegex = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
  if (!domainRegex.test(domain)) {
    throw new DomainServiceError({
      code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
      message: "Invalid domain format",
      details: { domain },
    });
  }
}

function toMarketplaceResult(item: {
  domainName: string;
  purchasable: boolean;
  premium?: boolean;
  purchasePrice?: number;
  renewalPrice?: number;
  purchaseType?: string;
  reason?: string;
}): DomainMarketplaceResult {
  return {
    domainName: item.domainName,
    available: Boolean(item.purchasable),
    premium: Boolean(item.premium),
    purchasePrice: item.purchasePrice ?? null,
    renewalPrice: item.renewalPrice ?? null,
    currency: "USD",
    purchaseType: item.purchaseType ?? null,
    reason: item.reason ?? null,
    fulfillment: "ahuracloud",
  };
}

function isBlockingPurchaseStatus(status: DomainPurchaseRequest["status"]): boolean {
  return status === "requested" || status === "processing" || status === "completed";
}

function toPublicPurchaseRequest(request: DomainPurchaseRequest): DomainPurchaseRequest {
  return {
    ...request,
    provider: "ahuracloud",
  };
}
