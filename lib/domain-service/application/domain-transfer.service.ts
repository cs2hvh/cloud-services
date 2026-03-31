import { createHash } from "node:crypto";
import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";
import type {
  DomainAuditLogPort,
  DomainBillingPort,
  DomainEmailPort,
  DomainNotificationPort,
  DomainTransferRegistrarPort,
  DomainTransferRequestRepositoryPort,
} from "@/lib/domain-service/core/ports";
import type { ActorContext, DomainTransferRequest, DomainTransferRequestStatus } from "@/lib/domain-service/core/types";

/** Name.com statuses mapped to internal statuses */
const PROVIDER_STATUS_MAP: Record<string, DomainTransferRequestStatus> = {
  "retrieving email": "pending",
  "pending approval": "pending",
  "approved": "approved",
  "completed": "completed",
  "cancelled": "cancelled",
  "rejected": "failed",
  "denied": "failed",
  "failed": "failed",
};

function mapProviderStatus(providerStatus: string): DomainTransferRequestStatus {
  const normalized = providerStatus.trim().toLowerCase();
  return PROVIDER_STATUS_MAP[normalized] || "pending";
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
  currency: string;
}

export class DomainTransferService {
  private readonly deps: {
    billing?: DomainBillingPort;
    audit?: DomainAuditLogPort;
    notifications?: DomainNotificationPort;
    email?: DomainEmailPort;
  };

  constructor(
    private readonly registrar: DomainTransferRegistrarPort,
    private readonly transfers: DomainTransferRequestRepositoryPort,
    deps: {
      billing?: DomainBillingPort;
      audit?: DomainAuditLogPort;
      notifications?: DomainNotificationPort;
      email?: DomainEmailPort;
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
          currency: "USD",
        };
      }

      return {
        domain,
        eligible: true,
        reason: null,
        transferPrice: null, // Actual price determined during createTransfer
        currency: "USD",
      };
    } catch {
      // If availability check fails, still allow registration (error will be caught during createTransfer)
      return {
        domain,
        eligible: true,
        reason: null,
        transferPrice: null,
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
    purchasePrice?: number;
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

    // Create the DB record first (status: initiated)
    const authCodeHashed = hashAuthCode(input.authCode);
    const request = await this.transfers.create({
      userId: actor.userId,
      domain,
      authCodeHash: authCodeHashed,
      currency: "USD",
      provider: "namecom",
      idempotencyKey: input.idempotencyKey || null,
      metadata: {
        privacy_enabled: input.privacyEnabled || false,
        ...(input.metadata || {}),
      },
      status: "initiated",
    });

    // Charge billing credits if applicable
    let chargedAmount = 0;
    if (input.purchasePrice && input.purchasePrice > 0 && this.deps.billing) {
      try {
        await this.deps.billing.chargeDomainPurchase({
          userId: actor.userId,
          purchaseRequestId: request.id,
          domain,
          amount: input.purchasePrice,
          currency: "USD",
        });
        chargedAmount = input.purchasePrice;
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
        purchasePrice: input.purchasePrice,
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
  }): Promise<DomainTransferRequest[]> {
    const requests = await this.transfers.listByUser({
      userId: input.actor.userId,
      limit: input.limit || 20,
    });
    return requests.map(toPublicTransferRequest);
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
  }): Promise<{ polled: number; updated: number; errors: number }> {
    const pending = await this.transfers.listPendingForPolling({
      limit: params?.limit || 50,
      staleBefore: params?.staleBefore,
    });

    let updated = 0;
    let errors = 0;

    for (const transfer of pending) {
      try {
        await this.pollSingleTransfer(transfer);
        updated++;
      } catch {
        errors++;
      }

      // Mark as polled regardless of outcome
      await this.transfers.updatePolled(transfer.id).catch(() => {});
    }

    return { polled: pending.length, updated, errors };
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

    // Only update if status actually changed
    if (newMappedStatus !== oldStatus || newProviderStatus !== transfer.provider_status) {
      await this.transfers.updateStatus({
        requestId: transfer.id,
        status: newMappedStatus,
        providerStatus: newProviderStatus,
        providerEmail: providerData.email || transfer.provider_email,
        lastError: null,
        failureReason: newMappedStatus === "failed" ? "provider_rejected" : null,
      });

      // Clear auth code when transfer reaches a terminal state
      if (newMappedStatus === "completed" || newMappedStatus === "failed" || newMappedStatus === "cancelled") {
        await this.transfers.clearAuthCode(transfer.id);
      }

      // If status changed to a notable state, emit events
      if (newMappedStatus !== oldStatus) {
        await this.emitStatusChangeEvents(transfer, oldStatus as DomainTransferRequestStatus, newMappedStatus);
      }
    }
  }

  private async emitStatusChangeEvents(
    transfer: DomainTransferRequest,
    _oldStatus: DomainTransferRequestStatus,
    newStatus: DomainTransferRequestStatus
  ): Promise<void> {
    const systemActor: ActorContext = {
      userId: transfer.user_id,
      userEmail: transfer.provider_email || undefined,
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
  return domain.trim().toLowerCase().replace(/\.+$/, "");
}

function ensureDomainFormat(domain: string): void {
  if (!domain.includes(".") || domain.length < 3) {
    throw new DomainServiceError({
      code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
      message: `Invalid domain name: ${domain}`,
      details: { domain },
    });
  }
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

  return error;
}

/** Strip auth_code_hash from public-facing responses */
function toPublicTransferRequest(request: DomainTransferRequest): DomainTransferRequest {
  return {
    ...request,
    auth_code_hash: null, // Never expose auth code hash
  };
}
