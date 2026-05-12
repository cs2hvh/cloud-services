import { createHash } from "node:crypto";
import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";
import type {
  DomainAuditLogPort,
  DomainBillingPort,
  DomainEmailPort,
  DomainNotificationPort,
  DomainPurchaseRequestRepositoryPort,
  DomainTransferRegistrarPort,
  DomainTransferRequestRepositoryPort,
  DomainUserResolverPort,
} from "@/lib/domain-service/core/ports";
import type { ActorContext, DomainTransferRequest, DomainTransferRequestStatus } from "@/lib/domain-service/core/types";

/** Name.com statuses mapped to internal statuses */
const PROVIDER_STATUS_MAP: Record<string, DomainTransferRequestStatus> = {
  "submitting transfer": "pending",
  "retrieving email": "pending",
  "pending approval": "pending",
  "pending_transfer": "pending",
  "pending": "pending",
  "approved": "approved",
  "completed": "completed",
  "transferred": "completed",
  "cancelled": "cancelled",
  "rejected": "failed",
  "denied": "failed",
  "failed": "failed",
};

function mapProviderStatus(providerStatus: string): DomainTransferRequestStatus {
  const normalized = providerStatus.trim().toLowerCase();
  const mapped = PROVIDER_STATUS_MAP[normalized];
  if (!mapped) {
    console.warn(
      `[DomainTransferService] Unknown provider status "${providerStatus}" — defaulting to "pending"`
    );
    return "pending";
  }
  return mapped;
}

function hashAuthCode(authCode: string): string {
  return createHash("sha256").update(authCode).digest("hex");
}

/** Statuses that block creating a new transfer for the same domain */
function isActiveTransferStatus(status: DomainTransferRequestStatus): boolean {
  return status === "initiated" || status === "pending" || status === "approved";
}

export interface DomainTransferEligibility {
  domain: string;
  eligible: boolean;
  reason: string | null;
  transferPrice: number | null;
  renewalPrice: number | null;
  currency: string;
}

export class DomainTransferService {
  private readonly deps: {
    billing?: DomainBillingPort;
    audit?: DomainAuditLogPort;
    notifications?: DomainNotificationPort;
    email?: DomainEmailPort;
    userResolver?: DomainUserResolverPort;
    purchaseRequests?: DomainPurchaseRequestRepositoryPort;
  };

  constructor(
    private readonly registrar: DomainTransferRegistrarPort,
    private readonly transfers: DomainTransferRequestRepositoryPort,
    deps: {
      billing?: DomainBillingPort;
      audit?: DomainAuditLogPort;
      notifications?: DomainNotificationPort;
      email?: DomainEmailPort;
      userResolver?: DomainUserResolverPort;
      purchaseRequests?: DomainPurchaseRequestRepositoryPort;
    } = {}
  ) {
    this.deps = deps;
  }

  /**
   * Check if a domain is eligible for transfer.
   * A domain is transferable if it's currently registered (not available for purchase)
   * and doesn't have an active transfer already in our system.
   */
  async checkEligibility(input: {
    actor: ActorContext;
    domain: string;
  }): Promise<DomainTransferEligibility> {
    const domain = normalizeDomain(input.domain);
    ensureDomainFormat(domain);

    // Check if there's already an active transfer
    const existingTransfer = await this.transfers.findActiveByDomain(domain);
    if (existingTransfer) {
      return {
        domain,
        eligible: false,
        reason: existingTransfer.user_id === input.actor.userId
          ? "You already have a transfer in progress for this domain"
          : "A transfer is already in progress for this domain",
        transferPrice: null,
        renewalPrice: null,
        currency: "USD",
      };
    }

    // Check via registrar: domain must NOT be purchasable (i.e., must be registered).
    // If checkAvailability returns purchasable=true, the domain is available → can't transfer.
    try {
      const availability = await this.registrar.checkAvailability([domain]);
      const result = availability.results[0];

      if (!result || result.purchasable) {
        return {
          domain,
          eligible: false,
          reason: "Domain is not registered or is not available for transfer. Please verify the domain name.",
          transferPrice: null,
          renewalPrice: null,
          currency: "USD",
        };
      }

      return {
        domain,
        eligible: true,
        reason: null,
        transferPrice: result.purchasePrice ?? null,
        renewalPrice: result.renewalPrice ?? result.purchasePrice ?? null,
        currency: "USD",
      };
    } catch (error: unknown) {
      console.error(
        `[DomainTransferService] Eligibility check failed for ${domain}:`,
        error instanceof Error ? error.message : error
      );
      return {
        domain,
        eligible: false,
        reason: "Could not verify transfer eligibility. Please try again later.",
        transferPrice: null,
        renewalPrice: null,
        currency: "USD",
      };
    }
  }

  /**
   * Create a domain transfer request.
   * Flow: validate → check duplicates → charge credits → call Name.com → save record.
   */
  async createTransferRequest(input: {
    actor: ActorContext;
    domain: string;
    authCode: string;
    privacyEnabled?: boolean;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }): Promise<DomainTransferRequest> {
    const domain = normalizeDomain(input.domain);
    ensureDomainFormat(domain);
    const actor = input.actor;

    // Check idempotency
    if (input.idempotencyKey) {
      const existing = await this.transfers.findByIdempotencyKey(
        actor.userId,
        input.idempotencyKey
      );
      if (existing) {
        return toPublicTransferRequest(existing);
      }
    }

    // Check for existing active transfer on this domain
    const existingActive = await this.transfers.findActiveByDomain(domain);
    if (existingActive && isActiveTransferStatus(existingActive.status)) {
      if (existingActive.user_id === actor.userId) {
        return toPublicTransferRequest(existingActive);
      }
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.TRANSFER_ALREADY_IN_PROGRESS,
        message: `A transfer is already in progress for ${domain}`,
        details: { domain },
      });
    }

    const pricing = await this.resolveTransferPricing(domain);

    // Create the DB record first (status: initiated)
    const authCodeHashed = hashAuthCode(input.authCode);
    const request = await this.transfers.create({
      userId: actor.userId,
      domain,
      authCodeHash: authCodeHashed,
      purchasePrice: pricing.purchasePrice,
      renewalPrice: pricing.renewalPrice,
      currency: "USD",
      provider: "namecom",
      idempotencyKey: input.idempotencyKey || null,
      metadata: {
        privacy_enabled: input.privacyEnabled || false,
        pricing_source: "namecom_check_availability",
        ...(input.metadata || {}),
      },
      status: "initiated",
    });

    // Charge billing credits if applicable
    let chargedAmount = 0;
    if (pricing.purchasePrice && pricing.purchasePrice > 0 && this.deps.billing) {
      try {
        await this.deps.billing.chargeDomainPurchase({
          userId: actor.userId,
          purchaseRequestId: request.id,
          domain,
          amount: pricing.purchasePrice,
          currency: "USD",
        });
        chargedAmount = pricing.purchasePrice;
      } catch (error: unknown) {
        const serviceError = error instanceof DomainServiceError
          ? error
          : new DomainServiceError({
              code: DOMAIN_ERROR_CODES.BILLING_CHARGE_FAILED,
              message: error instanceof Error ? error.message : "Transfer billing charge failed",
            });

        await this.transfers.updateStatus({
          requestId: request.id,
          status: "failed",
          lastError: serviceError.message,
          failureReason: "billing_failed",
        });

        await this.emitFailureEvents({
          actor,
          requestId: request.id,
          domain,
          error: serviceError,
          event: "domain_transfer_billing_failed",
        });

        throw serviceError;
      }
    }

    // Call Name.com to initiate the transfer
    let transferResponse: Awaited<ReturnType<DomainTransferRegistrarPort["createTransfer"]>>;
    try {
      transferResponse = await this.registrar.createTransfer({
        domainName: domain,
        authCode: input.authCode,
        purchasePrice: pricing.purchasePrice ?? undefined,
        privacyEnabled: input.privacyEnabled,
      });
    } catch (error: unknown) {
      const rawError = error instanceof DomainServiceError
        ? error
        : new DomainServiceError({
            code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
            message: error instanceof Error ? error.message : "Unknown transfer error",
          });

      // Map provider errors to more specific transfer errors
      const serviceError = mapTransferProviderError(rawError, domain);

      await this.transfers.updateStatus({
        requestId: request.id,
        status: "failed",
        lastError: serviceError.message,
        failureReason: "provider_rejected",
      });

      // Refund if we charged
      if (chargedAmount > 0 && this.deps.billing) {
        await this.safeAsync(async () => {
          await this.deps.billing!.refundDomainPurchase({
            userId: actor.userId,
            purchaseRequestId: request.id,
            domain,
            amount: chargedAmount,
            currency: "USD",
            reason: "transfer_failed",
          });
        });
      }

      await this.emitFailureEvents({
        actor,
        requestId: request.id,
        domain,
        error: serviceError,
        event: "domain_transfer_failed",
      });

      throw serviceError;
    }

    // Transfer initiated successfully — update record
    const providerStatus = transferResponse.transfer?.status || "Retrieving Email";
    const mappedStatus = mapProviderStatus(providerStatus);

    await this.transfers.updateStatus({
      requestId: request.id,
      status: mappedStatus === "completed" ? "completed" : "pending",
      providerOrderId: transferResponse.order ? String(transferResponse.order) : null,
      providerStatus,
      providerEmail: transferResponse.transfer?.email || null,
      lastError: null,
    });

    // Clear the auth code from DB now that it's been sent to the registrar
    await this.transfers.clearAuthCode(request.id);

    // Emit success events
    await this.safeAsync(async () => {
      await this.emitAudit({
        actor,
        action: "create",
        serviceId: request.id,
        serviceName: domain,
        metadata: {
          event: "domain_transfer_initiated",
          provider_order_id: transferResponse.order ? String(transferResponse.order) : null,
          provider_status: providerStatus,
          amount: chargedAmount,
          currency: "USD",
        },
      });
      await this.emitNotification({
        userId: actor.userId,
        action: "created",
        serviceName: domain,
        serviceId: request.id,
        type: "info",
        metadata: {
          event: "domain_transfer_initiated",
          provider_status: providerStatus,
          approval_email: transferResponse.transfer?.email,
        },
      });
      if (actor.userEmail) {
        await this.emitEmail({
          actor,
          severity: "info",
          alertTitle: "Domain transfer initiated",
          serviceName: domain,
          summary: `Your domain transfer for ${domain} has been initiated. ${
            transferResponse.transfer?.email
              ? `An approval email has been sent to ${transferResponse.transfer.email}.`
              : "The transfer is now being processed."
          } This typically takes 5–7 days.`,
          metadata: {
            provider_status: providerStatus,
            approval_email: transferResponse.transfer?.email || "N/A",
            amount: chargedAmount,
          },
        });
      }
    });

    return toPublicTransferRequest({
      ...request,
      status: mappedStatus === "completed" ? "completed" : "pending",
      provider_order_id: transferResponse.order ? String(transferResponse.order) : null,
      provider_status: providerStatus,
      provider_email: transferResponse.transfer?.email || null,
      auth_code_hash: null,
      last_error: null,
    });
  }

  /**
   * Get a single transfer request for a user.
   */
  async getTransferRequest(input: {
    actor: ActorContext;
    requestId: string;
  }): Promise<DomainTransferRequest> {
    const request = await this.transfers.findByIdForUser(input.requestId, input.actor.userId);
    if (!request) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.TRANSFER_NOT_FOUND,
        message: "Domain transfer request not found",
      });
    }
    return toPublicTransferRequest(request);
  }

  /**
   * List all transfer requests for a user.
   */
  async listTransferRequests(input: {
    actor: ActorContext;
    limit?: number;
    includeArchived?: boolean;
  }): Promise<DomainTransferRequest[]> {
    const requests = await this.transfers.listByUser({
      userId: input.actor.userId,
      limit: input.limit || 20,
      includeArchived: input.includeArchived,
    });
    return requests.map(toPublicTransferRequest);
  }

  /**
   * Hide a terminal transfer from the default activity list without deleting
   * billing/audit history.
   */
  async archiveTransferRequest(input: {
    actor: ActorContext;
    requestId: string;
  }): Promise<DomainTransferRequest> {
    const request = await this.transfers.findByIdForUser(input.requestId, input.actor.userId);
    if (!request) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.TRANSFER_NOT_FOUND,
        message: "Domain transfer request not found",
      });
    }

    if (isActiveTransferStatus(request.status)) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.TRANSFER_NOT_ELIGIBLE,
        message: "Active transfers cannot be archived. Cancel the transfer first if it should not continue.",
        details: { currentStatus: request.status },
      });
    }

    await this.transfers.archive(request.id, input.actor.userId);

    await this.safeAsync(async () => {
      await this.emitAudit({
        actor: input.actor,
        action: "update",
        serviceId: request.id,
        serviceName: request.domain,
        metadata: { event: "domain_transfer_archived" },
      });
    });

    return toPublicTransferRequest({
      ...request,
      metadata: {
        ...(request.metadata || {}),
        archived_at: new Date().toISOString(),
        archived_by: input.actor.userId,
      },
    });
  }

  /**
   * Cancel a pending transfer.
   */
  async cancelTransferRequest(input: {
    actor: ActorContext;
    requestId: string;
  }): Promise<DomainTransferRequest> {
    const request = await this.transfers.findByIdForUser(input.requestId, input.actor.userId);
    if (!request) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.TRANSFER_NOT_FOUND,
        message: "Domain transfer request not found",
      });
    }

    if (!isActiveTransferStatus(request.status)) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.TRANSFER_NOT_ELIGIBLE,
        message: `Transfer cannot be cancelled in status: ${request.status}`,
        details: { currentStatus: request.status },
      });
    }

    // Cancel at the registrar
    try {
      await this.registrar.cancelTransfer(request.domain);
    } catch (error: unknown) {
      // If cancellation fails at registrar, still mark as cancelled locally
      // (the transfer may have already completed or failed)
      console.warn(
        `[DomainTransferService] Registrar cancel failed for ${request.domain}:`,
        error instanceof Error ? error.message : error
      );
    }

    await this.transfers.updateStatus({
      requestId: request.id,
      status: "cancelled",
      providerStatus: "Cancelled",
      lastError: null,
    });

    // Refund if there was a charge
    const chargedAmount = Number(request.purchase_price || 0);
    if (chargedAmount > 0 && this.deps.billing) {
      await this.safeAsync(async () => {
        await this.deps.billing!.refundDomainPurchase({
          userId: input.actor.userId,
          purchaseRequestId: request.id,
          domain: request.domain,
          amount: chargedAmount,
          currency: request.currency,
          reason: "transfer_cancelled",
        });
      });
    }

    await this.safeAsync(async () => {
      await this.emitAudit({
        actor: input.actor,
        action: "update",
        serviceId: request.id,
        serviceName: request.domain,
        metadata: { event: "domain_transfer_cancelled" },
      });
      await this.emitNotification({
        userId: input.actor.userId,
        action: "updated",
        serviceName: request.domain,
        serviceId: request.id,
        type: "info",
        metadata: { event: "domain_transfer_cancelled" },
      });
      if (input.actor.userEmail) {
        await this.emitEmail({
          actor: input.actor,
          severity: "info",
          alertTitle: "Domain transfer cancelled",
          serviceName: request.domain,
          summary: `Your domain transfer for ${request.domain} has been cancelled. If credits were charged, a refund has been issued to your account.`,
          metadata: { event: "domain_transfer_cancelled" },
        });
      }
    });

    return toPublicTransferRequest({
      ...request,
      status: "cancelled",
      provider_status: "Cancelled",
      last_error: null,
    });
  }

  /**
   * Poll Name.com for status updates on pending transfers.
   * Called by a cron job / background worker.
   */
  async pollPendingTransfers(params?: {
    limit?: number;
    staleBefore?: string;
  }): Promise<{ polled: number; processed: number; errors: number }> {
    const pending = await this.transfers.listPendingForPolling({
      limit: params?.limit || 50,
      staleBefore: params?.staleBefore,
    });

    let processed = 0;
    let errors = 0;

    for (const transfer of pending) {
      try {
        await this.pollSingleTransfer(transfer);
        processed++;
      } catch (error: unknown) {
        console.error(
          `[DomainTransferService] Poll failed for ${transfer.domain}:`,
          error instanceof Error ? error.message : error
        );
        errors++;
      }

      // Mark as polled regardless of outcome
      await this.transfers.updatePolled(transfer.id).catch(() => {});
    }

    return { polled: pending.length, processed, errors };
  }

  private async pollSingleTransfer(transfer: DomainTransferRequest): Promise<void> {
    let providerData: Awaited<ReturnType<DomainTransferRegistrarPort["getTransfer"]>>;

    try {
      providerData = await this.registrar.getTransfer(transfer.domain);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to poll transfer";
      await this.transfers.updateStatus({
        requestId: transfer.id,
        status: transfer.status as DomainTransferRequestStatus,
        lastError: `Poll failed: ${message}`,
      });
      throw error;
    }

    const newProviderStatus = providerData.status || transfer.provider_status || "";
    const newMappedStatus = mapProviderStatus(newProviderStatus);
    const oldStatus = transfer.status;

    let completionMetadata: Record<string, unknown> | undefined;
    let completionRenewalPrice: number | null | undefined;

    if (newMappedStatus === "completed") {
      try {
        const domainInfo = await this.registrar.getDomain(transfer.domain);
        completionMetadata = { nameservers: domainInfo.nameservers ?? [] };
        completionRenewalPrice = domainInfo.renewalPrice ?? transfer.renewal_price ?? null;
      } catch (error: unknown) {
        console.warn(
          `[DomainTransferService] Could not load completed domain info for ${transfer.domain}:`,
          error instanceof Error ? error.message : error
        );
      }
    }

    // Only update if status actually changed
    if (newMappedStatus !== oldStatus || newProviderStatus !== transfer.provider_status) {
      await this.transfers.updateStatus({
        requestId: transfer.id,
        status: newMappedStatus,
        providerStatus: newProviderStatus,
        providerEmail: providerData.email || transfer.provider_email,
        lastError: null,
        failureReason: newMappedStatus === "failed" ? "provider_rejected" : null,
        renewalPrice: completionRenewalPrice,
        metadata: completionMetadata,
      });

      // Clear auth code when transfer reaches a terminal state
      if (newMappedStatus === "completed" || newMappedStatus === "failed" || newMappedStatus === "cancelled") {
        await this.transfers.clearAuthCode(transfer.id);
      }

      // On completion, create a domain_purchase_requests record so the domain
      // appears in inventory and the renewal cron can pick it up.
      if (newMappedStatus === "completed" && newMappedStatus !== oldStatus && this.deps.purchaseRequests) {
        await this.safeAsync(async () => {
          const existing = await this.deps.purchaseRequests!.findLatestByDomain({
            userId: transfer.user_id,
            domain: transfer.domain,
          });
          if (!existing) {
            await this.deps.purchaseRequests!.create({
              userId: transfer.user_id,
              domain: transfer.domain,
              purchasePrice: transfer.purchase_price ?? null,
              renewalPrice: completionRenewalPrice ?? transfer.renewal_price ?? null,
              currency: transfer.currency || "USD",
              provider: "namecom",
              providerRequestId: transfer.provider_order_id ?? null,
              status: "completed",
              metadata: {
                source: "transfer",
                transfer_request_id: transfer.id,
                expires_at: null,
                renewal_charged: false,
                autorenew_enabled: true,
                nameservers: completionMetadata?.nameservers ?? [],
              },
            });
          }
        });
      }

      // If status changed to a notable state, emit events
      if (newMappedStatus !== oldStatus) {
        await this.emitStatusChangeEvents(transfer, oldStatus as DomainTransferRequestStatus, newMappedStatus);
      }
    }
  }

  private async resolveTransferPricing(domain: string): Promise<{
    purchasePrice: number | null;
    renewalPrice: number | null;
  }> {
    try {
      const availability = await this.registrar.checkAvailability([domain]);
      const result = availability.results[0];

      if (!result || result.purchasable) {
        throw new DomainServiceError({
          code: DOMAIN_ERROR_CODES.TRANSFER_NOT_ELIGIBLE,
          message: "Domain is not registered or is not available for transfer.",
          details: { domain },
        });
      }

      return {
        purchasePrice: result.purchasePrice ?? null,
        renewalPrice: result.renewalPrice ?? result.purchasePrice ?? null,
      };
    } catch (error: unknown) {
      if (error instanceof DomainServiceError) {
        throw error;
      }
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: "Could not resolve transfer pricing from registrar.",
        details: { domain },
      });
    }
  }

  private async emitStatusChangeEvents(
    transfer: DomainTransferRequest,
    _oldStatus: DomainTransferRequestStatus,
    newStatus: DomainTransferRequestStatus
  ): Promise<void> {
    // Resolve user email so completion/failure emails reach the user from the polling path.
    // provider_email is the WHOIS registrant contact, not the platform user's email.
    const resolvedEmail = this.deps.userResolver
      ? await this.deps.userResolver.getUserEmail(transfer.user_id).catch(() => null)
      : null;

    const systemActor: ActorContext = {
      userId: transfer.user_id,
      userEmail: resolvedEmail ?? undefined,
      userRole: "system",
    };

    if (newStatus === "completed") {
      await this.safeAsync(async () => {
        await this.emitAudit({
          actor: systemActor,
          action: "update",
          serviceId: transfer.id,
          serviceName: transfer.domain,
          metadata: { event: "domain_transfer_completed" },
        });
        await this.emitNotification({
          userId: transfer.user_id,
          action: "updated",
          serviceName: transfer.domain,
          serviceId: transfer.id,
          type: "success",
          metadata: { event: "domain_transfer_completed" },
        });
        if (systemActor.userEmail) {
          await this.emitEmail({
            actor: systemActor,
            severity: "info",
            alertTitle: "Domain transfer completed",
            serviceName: transfer.domain,
            summary: `Your domain transfer for ${transfer.domain} has completed successfully! The domain is now managed by AhuraCloud.`,
            metadata: {
              event: "domain_transfer_completed",
            },
          });
        }
      });
    } else if (newStatus === "failed") {
      await this.safeAsync(async () => {
        await this.emitAudit({
          actor: systemActor,
          action: "update",
          serviceId: transfer.id,
          serviceName: transfer.domain,
          metadata: { event: "domain_transfer_failed" },
        });
        await this.emitNotification({
          userId: transfer.user_id,
          action: "failed",
          serviceName: transfer.domain,
          serviceId: transfer.id,
          type: "error",
          error: "Domain transfer was rejected by the current registrar",
          metadata: { event: "domain_transfer_failed" },
        });
        if (systemActor.userEmail) {
          await this.emitEmail({
            actor: systemActor,
            severity: "warning",
            alertTitle: "Domain transfer failed",
            serviceName: transfer.domain,
            summary: `Your domain transfer for ${transfer.domain} was rejected by your current registrar. Please check the transfer details and try again.`,
            metadata: {
              event: "domain_transfer_failed",
            },
          });
        }
      });

      // Auto-refund on failure from polling
      const chargedAmount = Number(transfer.purchase_price || 0);
      if (chargedAmount > 0 && this.deps.billing) {
        await this.safeAsync(async () => {
          await this.deps.billing!.refundDomainPurchase({
            userId: transfer.user_id,
            purchaseRequestId: transfer.id,
            domain: transfer.domain,
            amount: chargedAmount,
            currency: transfer.currency,
            reason: "transfer_rejected",
          });
        });
      }
    } else if (newStatus === "cancelled") {
      await this.safeAsync(async () => {
        await this.emitAudit({
          actor: systemActor,
          action: "update",
          serviceId: transfer.id,
          serviceName: transfer.domain,
          metadata: { event: "domain_transfer_cancelled_by_registrar" },
        });
        await this.emitNotification({
          userId: transfer.user_id,
          action: "updated",
          serviceName: transfer.domain,
          serviceId: transfer.id,
          type: "info",
          metadata: { event: "domain_transfer_cancelled_by_registrar" },
        });
      });
    }
  }

  /* ─── Event helpers (same pattern as DomainMarketplaceService) ─── */

  private async emitFailureEvents(params: {
    actor: ActorContext;
    requestId: string;
    domain: string;
    error: DomainServiceError;
    event: string;
  }): Promise<void> {
    await this.safeAsync(async () => {
      await this.emitAudit({
        actor: params.actor,
        action: "update",
        serviceId: params.requestId,
        serviceName: params.domain,
        metadata: {
          event: params.event,
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
        metadata: { event: params.event, error_code: params.error.code },
      });
      if (params.actor.userEmail) {
        await this.emitEmail({
          actor: params.actor,
          severity: "warning",
          alertTitle: "Domain transfer failed",
          serviceName: params.domain,
          summary: `Your domain transfer for ${params.domain} failed: ${params.error.message}. Please check the details and try again.`,
          metadata: {
            error_code: params.error.code,
            event: params.event,
          },
        });
      }
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

  private async safeAsync(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (error: unknown) {
      console.warn(
        "[DomainTransferService] Non-critical async operation failed:",
        error instanceof Error ? error.message : error
      );
    }
  }
}

/* ─── Helpers ─── */

function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")  // strip http:// or https://
    .replace(/^www\./, "")         // strip leading www.
    .replace(/\/.*$/, "")          // strip path and query string
    .replace(/\?.*$/, "")          // strip remaining query string
    .replace(/\.+$/, "");          // strip trailing dots
}

function ensureDomainFormat(domain: string): void {
  // Reject email addresses (@ should never survive normalization for transfer)
  if (domain.includes("@")) {
    throw new DomainServiceError({
      code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
      message: "Please enter a domain name (e.g., example.com), not an email address.",
      details: { domain },
    });
  }

  // Must contain at least one dot (TLD required)
  if (!domain.includes(".")) {
    throw new DomainServiceError({
      code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
      message: "Please enter a valid domain name including a TLD, such as example.com.",
      details: { domain },
    });
  }

  // Length: 3-253 per DNS spec
  if (domain.length < 3 || domain.length > 253) {
    throw new DomainServiceError({
      code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
      message: "Domain name must be between 3 and 253 characters.",
      details: { domain },
    });
  }

  // Each dot-separated label must be valid
  const labels = domain.split(".");
  if (labels.length < 2) {
    throw new DomainServiceError({
      code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
      message: "Please enter a domain name with at least a name and a TLD (e.g., example.com).",
      details: { domain },
    });
  }

  for (const label of labels) {
    if (label.length === 0 || label.length > 63) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
        message: "Each part of the domain name must be between 1 and 63 characters.",
        details: { domain },
      });
    }

    // RFC 1123: alphanumeric start/end, hyphens in the middle only
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
        message: "Domain name contains invalid characters. Only letters, numbers, and hyphens are allowed.",
        details: { domain },
      });
    }
  }

  // TLD must be at least 2 alphabetic chars (not purely numeric)
  const tld = labels[labels.length - 1];
  if (tld.length < 2) {
    throw new DomainServiceError({
      code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
      message: "The domain extension (TLD) must be at least 2 characters (e.g., .com, .net, .guru).",
      details: { domain },
    });
  }

  if (/^[0-9]+$/.test(tld)) {
    throw new DomainServiceError({
      code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
      message: "The domain extension (TLD) cannot be all numeric.",
      details: { domain },
    });
  }

  if (!looksLikeRegistrableRoot(labels)) {
    throw new DomainServiceError({
      code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
      message: "Transfers must use a root-level domain, such as example.com. Subdomains like app.example.com cannot be transferred.",
      details: { domain },
    });
  }
}

function looksLikeRegistrableRoot(labels: string[]): boolean {
  if (labels.length === 2) return true;
  if (labels.length !== 3) return false;

  const secondLevel = labels[1];
  const countryCodeTld = labels[2];
  const commonSecondLevelTlds = new Set([
    "ac", "co", "com", "edu", "gov", "net", "org",
  ]);

  return countryCodeTld.length === 2 && commonSecondLevelTlds.has(secondLevel);
}

function mapTransferProviderError(error: DomainServiceError, domain: string): DomainServiceError {
  const msg = error.message.toLowerCase();

  if (/auth.?code|authorization/i.test(msg)) {
    return new DomainServiceError({
      code: DOMAIN_ERROR_CODES.TRANSFER_AUTH_CODE_INVALID,
      message: `Invalid authorization code for ${domain}. Please check the EPP/auth code from your current registrar.`,
      details: { domain },
    });
  }

  if (/lock|prohibited|clienttransfer/i.test(msg)) {
    return new DomainServiceError({
      code: DOMAIN_ERROR_CODES.TRANSFER_DOMAIN_LOCKED,
      message: `Domain ${domain} is locked. Please unlock it at your current registrar before transferring.`,
      details: { domain },
    });
  }

  if (/60.?day|recently.?registered|recently.?transferred/i.test(msg)) {
    return new DomainServiceError({
      code: DOMAIN_ERROR_CODES.TRANSFER_NOT_ELIGIBLE,
      message: `Domain ${domain} is not eligible for transfer. It may have been registered or transferred within the last 60 days.`,
      details: { domain },
    });
  }

  if (/not.?found|does not exist/i.test(msg)) {
    return new DomainServiceError({
      code: DOMAIN_ERROR_CODES.TRANSFER_NOT_ELIGIBLE,
      message: `Domain ${domain} was not found at the registrar. Please verify the domain name is correct.`,
      details: { domain },
    });
  }

  if (/domain.?name|parameter.?value|invalid.?argument/i.test(msg)) {
    return new DomainServiceError({
      code: DOMAIN_ERROR_CODES.TRANSFER_NOT_ELIGIBLE,
      message: `The registrar rejected the domain name. Make sure you are transferring a root-level domain (e.g., sabpatahai.guru, not test.sabpatahai.guru), and that the domain is registered and not restricted.`,
      details: { domain },
    });
  }

  // Catch-all: any remaining provider validation failure gets a user-friendly message
  if (error.code === DOMAIN_ERROR_CODES.PROVIDER_VALIDATION_FAILED) {
    return new DomainServiceError({
      code: DOMAIN_ERROR_CODES.PROVIDER_VALIDATION_FAILED,
      message: `The registrar rejected the transfer request. Ensure the domain is unlocked, the authorization code is correct, and you are transferring a registered root-level domain.`,
      details: { domain },
    });
  }

  return error;
}

/** Strip auth_code_hash from public-facing responses */
function toPublicTransferRequest(request: DomainTransferRequest): DomainTransferRequest {
  return {
    ...request,
    auth_code_hash: null, // Never expose auth code hash
  };
}
