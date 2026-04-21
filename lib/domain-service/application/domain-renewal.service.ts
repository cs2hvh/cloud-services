import type { DomainAuditLogPort, DomainBillingPort, DomainNotificationPort } from "@/lib/domain-service/core/ports";

interface Deps {
  billing: DomainBillingPort;
  audit: DomainAuditLogPort;
  notifications: DomainNotificationPort;
}

/**
 * Handles per-domain renewal billing and observability.
 * The cron owns DB locking and expiry updates — this service owns billing + audit + notification.
 */
export class DomainRenewalService {
  constructor(private readonly deps: Deps) {}

  async chargeAndNotify(params: {
    purchaseRequestId: string;
    userId: string;
    domain: string;
    amount: number;
    currency: string;
    expiresAt: string | null;
  }): Promise<{ nextExpiresAt: string | null }> {
    const { purchaseRequestId, userId, domain, amount, currency, expiresAt } = params;

    await this.deps.billing.chargeRenewal({ userId, purchaseRequestId, domain, amount, currency });

    const nextExpiresAt = expiresAt
      ? new Date(new Date(expiresAt).getTime() + 365 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Non-blocking — observability failure must never fail the renewal
    void Promise.allSettled([
      this.deps.audit.log({
        userId, userRole: "system", action: "update",
        serviceId: purchaseRequestId, serviceName: domain,
        metadata: { event: "domain_renewal_charged", amount, currency, next_expires_at: nextExpiresAt },
      }),
      this.deps.notifications.notify({
        userId, action: "updated", serviceName: domain, serviceId: purchaseRequestId, type: "info",
        metadata: { event: "domain_renewal_charged", amount, currency, next_expires_at: nextExpiresAt },
      }),
    ]);

    return { nextExpiresAt };
  }
}
