import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";
import type {
  AppReadPort,
  DomainMarketplaceRegistrarPort,
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
  constructor(
    private readonly registrar: DomainMarketplaceRegistrarPort,
    private readonly appRead: AppReadPort,
    private readonly purchaseRequests: DomainPurchaseRequestRepositoryPort
  ) {}

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
    appId: string;
    domain: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }): Promise<DomainPurchaseRequest> {
    const cleanDomain = normalizeDomainCandidate(input.domain);
    ensureDomainFormat(cleanDomain);

    await this.appRead.getOwnedApp(input.appId, input.actor.userId);

    const existingByDomain = await this.purchaseRequests.findLatestByAppAndDomain({
      userId: input.actor.userId,
      appId: input.appId,
      domain: cleanDomain,
    });
    if (existingByDomain && isBlockingPurchaseStatus(existingByDomain.status)) {
      return existingByDomain;
    }

    if (input.idempotencyKey) {
      const existing = await this.purchaseRequests.findByIdempotencyKey(
        input.actor.userId,
        input.idempotencyKey
      );
      if (existing) {
        if (existing.app_id !== input.appId || existing.domain !== cleanDomain) {
          throw new DomainServiceError({
            code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
            message: "Idempotency key already used with a different purchase request payload",
            details: {
              idempotency_key: input.idempotencyKey,
              existing_request_id: existing.id,
            },
          });
        }
        return existing;
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
      appId: input.appId,
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
      const serviceError = error instanceof DomainServiceError
        ? error
        : new DomainServiceError({
            code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
            message: error instanceof Error ? error.message : "Unknown purchase error",
          });

      if (
        serviceError.code === DOMAIN_ERROR_CODES.PROVIDER_VALIDATION_FAILED
        && /already|registered|unavailable|not available|taken/i.test(serviceError.message)
      ) {
        await this.purchaseRequests.updateStatus({
          requestId: request.id,
          status: "failed",
          lastError: `Domain ${cleanDomain} is no longer available for registration`,
        });

        throw new DomainServiceError({
          code: DOMAIN_ERROR_CODES.DOMAIN_NOT_AVAILABLE,
          message: `Domain ${cleanDomain} is no longer available for registration`,
          details: { domain: cleanDomain },
        });
      }

      await this.purchaseRequests.updateStatus({
        requestId: request.id,
        status: "failed",
        lastError: serviceError.message,
      });

      throw serviceError;
    }

    await this.purchaseRequests.updateStatus({
      requestId: request.id,
      status: "completed",
      providerRequestId: purchase.order ? String(purchase.order) : null,
      lastError: null,
    });

    return {
      ...request,
      status: "completed",
      provider_request_id: purchase.order ? String(purchase.order) : null,
      last_error: null,
    };
  }

  async listPurchaseRequests(input: {
    actor: ActorContext;
    appId?: string;
    limit?: number;
  }): Promise<DomainPurchaseRequest[]> {
    if (input.appId) {
      await this.appRead.getOwnedApp(input.appId, input.actor.userId);
    }

    return this.purchaseRequests.listByUser({
      userId: input.actor.userId,
      appId: input.appId,
      limit: input.limit || 20,
    });
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

    return request;
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
