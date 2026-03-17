import { randomBytes } from "crypto";
import { APP_DOMAIN } from "@/config/domain";
import {
  DOMAIN_ERROR_CODES,
  DomainServiceError,
  toDomainServiceError,
} from "@/lib/domain-service/core/errors";
import type {
  AppReadPort,
  DnsProviderPort,
  DomainAuditLogPort,
  DomainEmailPort,
  DomainNotificationPort,
  DomainOperationRepositoryPort,
  DomainPurchaseRequestRepositoryPort,
  DomainRegistrarPort,
  DomainRepositoryPort,
  IngressPort,
} from "@/lib/domain-service/core/ports";
import type { ActorContext, DomainOperation, DomainRecord } from "@/lib/domain-service/core/types";

interface DomainServiceDeps {
  appRead: AppReadPort;
  domains: DomainRepositoryPort;
  operations: DomainOperationRepositoryPort;
  registrar: DomainRegistrarPort;
  dns: DnsProviderPort;
  ingress: IngressPort;
  purchaseRequests?: DomainPurchaseRequestRepositoryPort;
  audit?: DomainAuditLogPort;
  notifications?: DomainNotificationPort;
  email?: DomainEmailPort;
}

type AddDomainResult = {
  domain: DomainRecord;
  verification_required: boolean;
  managed_zone_detected: boolean;
  ownership_source: "purchase_request" | "registrar" | "external";
  verification_instructions: {
    record_type: "TXT";
    record_name: string;
    record_value: string;
    ttl: number;
  } | null;
};

export class DomainService {
  constructor(private readonly deps: DomainServiceDeps) {}

  async listDomains(input: { actor: ActorContext; appId: string }): Promise<DomainRecord[]> {
    await this.deps.appRead.getOwnedApp(input.appId, input.actor.userId);
    return this.deps.domains.listByApp(input.appId, input.actor.userId);
  }

  async addDomain(input: {
    actor: ActorContext;
    appId: string;
    domain: string;
    idempotencyKey?: string;
  }): Promise<AddDomainResult> {
    const cleanDomain = normalizeDomain(input.domain);
    ensureDomainFormat(cleanDomain);

    const fromIdempotency = await this.tryIdempotentResult<AddDomainResult>(
      input.actor.userId,
      "domain.add",
      input.idempotencyKey
    );
    if (fromIdempotency) {
      return normalizeAddDomainResult(fromIdempotency);
    }

    await this.deps.appRead.getOwnedApp(input.appId, input.actor.userId);

    const existing = await this.deps.domains.findActiveByDomain(cleanDomain);
    if (existing) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_ALREADY_IN_USE,
        message:
          existing.app_id === input.appId
            ? "This domain is already added to this app"
            : "This domain is already in use by another app",
      });
    }

    const ownership = await this.resolveOwnershipMode({
      domain: cleanDomain,
      userId: input.actor.userId,
    });

    const verificationToken = `verify_${randomBytes(8).toString("hex")}`;
    const createdDomain = await this.deps.domains.createPending({
      appId: input.appId,
      userId: input.actor.userId,
      domain: cleanDomain,
      verificationToken,
    });

    const domain = ownership.managedByPlatform
      ? await this.deps.domains.markVerified(createdDomain.id)
      : createdDomain;

    const response = {
      domain,
      verification_required: !ownership.managedByPlatform,
      managed_zone_detected: ownership.managedByPlatform,
      ownership_source: ownership.source,
      verification_instructions: ownership.managedByPlatform
        ? null
        : {
            record_type: "TXT" as const,
            record_name: `galaxyhvh-verify.${cleanDomain}`,
            record_value: verificationToken,
            ttl: 300,
          },
    };

    await this.persistCompletedIdempotentOperation({
      action: "domain.add",
      actorUserId: input.actor.userId,
      idempotencyKey: input.idempotencyKey,
      domainId: domain.id,
      requestData: { app_id: input.appId, domain: cleanDomain },
      responseData: response as unknown as Record<string, unknown>,
    });

    await this.emitNonBlocking(async () => {
      await this.emitAudit({
        actor: input.actor,
        action: "create",
        serviceId: domain.id,
        serviceName: cleanDomain,
        metadata: {
          app_id: input.appId,
          event: "domain_added",
          managed_zone_detected: ownership.managedByPlatform,
          ownership_source: ownership.source,
        },
      });
      await this.emitNotification({
        userId: input.actor.userId,
        action: "created",
        serviceName: cleanDomain,
        serviceId: domain.id,
        type: "success",
        metadata: {
          app_id: input.appId,
          managed_zone_detected: ownership.managedByPlatform,
          ownership_source: ownership.source,
        },
      });
    });

    return response;
  }

  async verifyDomain(input: {
    actor: ActorContext;
    domainId: string;
    forceRefresh?: boolean;
    idempotencyKey?: string;
  }): Promise<DomainRecord> {
    const fromIdempotency = await this.tryIdempotentResult<DomainRecord>(
      input.actor.userId,
      "domain.verify",
      input.idempotencyKey
    );
    if (fromIdempotency) {
      return fromIdempotency;
    }

    const domain = await this.getOwnedDomain(input.domainId, input.actor.userId);

    if (!input.forceRefresh && (domain.status === "active" || domain.status === "verified")) {
      return domain;
    }

    const recordName = `galaxyhvh-verify.${domain.domain}`;
    const txtRecords = await this.deps.dns.listTxtRecords(recordName);

    const verified = txtRecords.some((record) => record.includes(domain.verification_token));
    if (!verified) {
      await this.deps.domains.updateLastError(
        domain.id,
        `Verification token not found in TXT records for ${recordName}`
      );
      await this.emitNonBlocking(async () => {
        await this.emitAudit({
          actor: input.actor,
          action: "update",
          serviceId: domain.id,
          serviceName: domain.domain,
          metadata: {
            event: "domain_verification_failed",
            record_name: recordName,
          },
        });
        await this.emitNotification({
          userId: input.actor.userId,
          action: "failed",
          serviceName: domain.domain,
          serviceId: domain.id,
          type: "warning",
          error: "Verification token not found in DNS TXT records",
          metadata: { record_name: recordName },
        });
      });
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_NOT_VERIFIED,
        message: "Verification token not found in DNS TXT records",
        details: { record_name: recordName, records_found: txtRecords },
      });
    }

    const updated = await this.deps.domains.markVerified(domain.id);

    await this.persistCompletedIdempotentOperation({
      action: "domain.verify",
      actorUserId: input.actor.userId,
      idempotencyKey: input.idempotencyKey,
      domainId: updated.id,
      requestData: {
        domain_id: input.domainId,
      },
      responseData: updated as unknown as Record<string, unknown>,
    });

    await this.emitNonBlocking(async () => {
      await this.emitAudit({
        actor: input.actor,
        action: "update",
        serviceId: updated.id,
        serviceName: updated.domain,
        metadata: { event: "domain_verified" },
      });
      await this.emitNotification({
        userId: input.actor.userId,
        action: "updated",
        serviceName: updated.domain,
        serviceId: updated.id,
        type: "success",
        metadata: { event: "domain_verified" },
      });
    });

    return updated;
  }

  async activateDomain(input: {
    actor: ActorContext;
    domainId: string;
    idempotencyKey?: string;
  }): Promise<DomainOperation> {
    const fromIdempotency = await this.tryIdempotentOperation(
      input.actor.userId,
      "domain.activate",
      input.idempotencyKey
    );
    if (fromIdempotency) {
      return fromIdempotency;
    }

    const domain = await this.getOwnedDomain(input.domainId, input.actor.userId);
    if (domain.status !== "verified" && domain.status !== "active") {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_NOT_VERIFIED,
        message: `Domain must be verified before activation. Current status: ${domain.status}`,
      });
    }

    const operation = await this.deps.operations.create({
      userId: input.actor.userId,
      action: "domain.activate",
      domainId: domain.id,
      idempotencyKey: input.idempotencyKey,
      requestData: { domain_id: input.domainId },
      status: "pending",
    });

    void this.processActivationOperation(operation.id, input.actor);

    return operation;
  }

  async setPrimaryDomain(input: {
    actor: ActorContext;
    domainId: string;
    redirectToPrimary?: boolean;
    idempotencyKey?: string;
  }): Promise<DomainRecord> {
    const fromIdempotency = await this.tryIdempotentResult<DomainRecord>(
      input.actor.userId,
      "domain.set-primary",
      input.idempotencyKey
    );
    if (fromIdempotency) {
      return fromIdempotency;
    }

    const domain = await this.getOwnedDomain(input.domainId, input.actor.userId);
    if (domain.status !== "active") {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_NOT_ACTIVE,
        message: "Only active domains can be set as primary",
      });
    }

    const updated = await this.deps.domains.setPrimary(domain.id, domain.app_id, {
      redirectToPrimary: input.redirectToPrimary,
    });

    await this.persistCompletedIdempotentOperation({
      action: "domain.set-primary",
      actorUserId: input.actor.userId,
      idempotencyKey: input.idempotencyKey,
      domainId: updated.id,
      requestData: {
        domain_id: input.domainId,
        redirect_to_primary: input.redirectToPrimary ?? null,
      },
      responseData: updated as unknown as Record<string, unknown>,
    });

    await this.emitNonBlocking(async () => {
      await this.emitAudit({
        actor: input.actor,
        action: "update",
        serviceId: updated.id,
        serviceName: updated.domain,
        metadata: {
          event: "domain_set_primary",
          redirect_to_primary: input.redirectToPrimary ?? null,
        },
      });
      await this.emitNotification({
        userId: input.actor.userId,
        action: "updated",
        serviceName: updated.domain,
        serviceId: updated.id,
        type: "info",
        metadata: {
          event: "domain_set_primary",
          redirect_to_primary: input.redirectToPrimary ?? null,
        },
      });
    });

    return updated;
  }

  async removeDomain(input: {
    actor: ActorContext;
    domainId: string;
    idempotencyKey?: string;
  }): Promise<{ deleted: true; domain_id: string }> {
    const fromIdempotency = await this.tryIdempotentResult<{ deleted: true; domain_id: string }>(
      input.actor.userId,
      "domain.remove",
      input.idempotencyKey
    );
    if (fromIdempotency) {
      return fromIdempotency;
    }

    const domain = await this.getOwnedDomain(input.domainId, input.actor.userId);
    const app = await this.deps.appRead.getOwnedApp(domain.app_id, input.actor.userId);

    if (domain.status === "active") {
      await this.deps.ingress.removeDomainFromAppIngress(app.name, domain.domain);

      const cnameTarget = `${app.slug}.${APP_DOMAIN}`;
      try {
        await this.deps.dns.removeRoutingRecord({
          fqdn: domain.domain,
          target: cnameTarget,
        });
      } catch (error: unknown) {
        const dnsError = toDomainServiceError(error);
        if (!shouldSkipManagedDnsAutomation(dnsError)) {
          await this.emitNonBlocking(async () => {
            await this.emitAudit({
              actor: input.actor,
              action: "update",
              serviceId: domain.id,
              serviceName: domain.domain,
              metadata: {
                event: "domain_dns_cleanup_failed",
                app_id: domain.app_id,
                error_code: dnsError.code,
                error_message: dnsError.message,
              },
            });
          });
        }
      }
    }

    await this.deps.domains.markRemoved(domain.id);

    const response = { deleted: true as const, domain_id: domain.id };

    await this.persistCompletedIdempotentOperation({
      action: "domain.remove",
      actorUserId: input.actor.userId,
      idempotencyKey: input.idempotencyKey,
      domainId: domain.id,
      requestData: { domain_id: input.domainId },
      responseData: response as unknown as Record<string, unknown>,
    });

    await this.emitNonBlocking(async () => {
      await this.emitAudit({
        actor: input.actor,
        action: "delete",
        serviceId: domain.id,
        serviceName: domain.domain,
        metadata: { event: "domain_removed", app_id: domain.app_id },
      });
      await this.emitNotification({
        userId: input.actor.userId,
        action: "deleted",
        serviceName: domain.domain,
        serviceId: domain.id,
        type: "warning",
        metadata: { app_id: domain.app_id },
      });
    });

    return response;
  }

  async getOperation(input: { actor: ActorContext; operationId: string }): Promise<DomainOperation> {
    const operation = await this.deps.operations.findByIdForUser(input.operationId, input.actor.userId);

    if (!operation) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.OPERATION_NOT_FOUND,
        message: "Operation not found",
      });
    }

    return operation;
  }

  private async processActivationOperation(operationId: string, actor: ActorContext): Promise<void> {
    const userId = actor.userId;
    try {
      const operation = await this.deps.operations.findByIdForUser(operationId, userId);
      if (!operation || !operation.domain_id) {
        return;
      }

      await this.deps.operations.markRunning(operation.id);

      const domain = await this.getOwnedDomain(operation.domain_id, userId);
      const app = await this.deps.appRead.getOwnedApp(domain.app_id, userId);

      const cnameTarget = `${app.slug}.${APP_DOMAIN}`;
      let dnsAutoConfigured = true;
      let dnsAutomationMessage: string | null = null;

      try {
        await this.deps.dns.ensureRoutingRecord({
          fqdn: domain.domain,
          target: cnameTarget,
          ttl: 300,
        });
      } catch (error: unknown) {
        const dnsError = toDomainServiceError(error);
        if (!shouldSkipManagedDnsAutomation(dnsError)) {
          throw dnsError;
        }
        dnsAutoConfigured = false;
        dnsAutomationMessage = dnsError.message;
      }

      await this.deps.ingress.addDomainToAppIngress(app.name, domain.domain);
      const updated = await this.deps.domains.markActive(domain.id);

      await this.deps.operations.markSucceeded(operation.id, {
        domain_id: updated.id,
        status: updated.status,
        activated_at: updated.activated_at,
        dns_auto_configured: dnsAutoConfigured,
        dns_automation_message: dnsAutomationMessage,
      });

      await this.emitNonBlocking(async () => {
        await this.emitAudit({
          actor,
          action: "update",
          serviceId: updated.id,
          serviceName: updated.domain,
          metadata: {
            event: "domain_activated",
            operation_id: operation.id,
            app_id: updated.app_id,
            dns_auto_configured: dnsAutoConfigured,
            dns_automation_message: dnsAutomationMessage,
          },
        });
        await this.emitNotification({
          userId,
          action: "attached",
          serviceName: updated.domain,
          serviceId: updated.id,
          type: "success",
          metadata: {
            operation_id: operation.id,
            app_id: updated.app_id,
            dns_auto_configured: dnsAutoConfigured,
          },
        });
        await this.emitEmail({
          actor,
          severity: "info",
          alertTitle: "Domain activated",
          serviceName: updated.domain,
          summary: `Domain ${updated.domain} has been activated and attached to app ${app.name}.`,
          metadata: {
            operation_id: operation.id,
            app_name: app.name,
            dns_auto_configured: dnsAutoConfigured,
          },
        });
      });
    } catch (error: unknown) {
      const serviceError = toDomainServiceError(error);

      try {
        const operation = await this.deps.operations.findByIdForUser(operationId, userId);
        if (operation?.domain_id) {
          await this.deps.domains.updateLastError(operation.domain_id, serviceError.message);
        }
        const failedDomain = operation?.domain_id
          ? await this.deps.domains.findByIdForUser(operation.domain_id, userId).catch(() => null)
          : null;

        await this.deps.operations.markFailed({
          operationId,
          code: serviceError.code,
          message: serviceError.message,
          retryable: serviceError.retryable,
        });

        await this.emitNonBlocking(async () => {
          await this.emitAudit({
            actor,
            action: "update",
            serviceId: operation?.domain_id || operationId,
            serviceName: failedDomain?.domain || "domain",
            metadata: {
              event: "domain_activation_failed",
              operation_id: operationId,
              error_code: serviceError.code,
              error_message: serviceError.message,
            },
          });
          await this.emitNotification({
            userId,
            action: "failed",
            serviceName: failedDomain?.domain || "domain",
            serviceId: operation?.domain_id || undefined,
            type: "error",
            error: serviceError.message,
            metadata: {
              operation_id: operationId,
              error_code: serviceError.code,
            },
          });
          await this.emitEmail({
            actor,
            severity: "critical",
            alertTitle: "Domain activation failed",
            serviceName: failedDomain?.domain || "domain",
            summary: `Domain activation failed: ${serviceError.message}`,
            metadata: {
              operation_id: operationId,
              error_code: serviceError.code,
            },
          });
        });
      } catch (markError) {
        console.error("[DomainService] Failed to persist operation failure", markError);
      }
    }
  }

  private async getOwnedDomain(domainId: string, userId: string): Promise<DomainRecord> {
    const domain = await this.deps.domains.findByIdForUser(domainId, userId);
    if (!domain) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_NOT_FOUND,
        message: "Domain not found",
      });
    }

    return domain;
  }

  private async tryIdempotentOperation(
    userId: string,
    action: string,
    idempotencyKey?: string
  ): Promise<DomainOperation | null> {
    if (!idempotencyKey) {
      return null;
    }

    const existing = await this.deps.operations.findByIdempotencyKey({
      userId,
      action,
      idempotencyKey,
    });

    if (!existing) {
      return null;
    }

    if (existing.status === "pending" || existing.status === "running") {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.OPERATION_IN_PROGRESS,
        message: "An operation with the same idempotency key is still running",
      });
    }

    return existing;
  }

  private async tryIdempotentResult<T>(
    userId: string,
    action: string,
    idempotencyKey?: string
  ): Promise<T | null> {
    if (!idempotencyKey) {
      return null;
    }

    const existing = await this.deps.operations.findByIdempotencyKey({
      userId,
      action,
      idempotencyKey,
    });

    if (!existing) {
      return null;
    }

    if (existing.status === "pending" || existing.status === "running") {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.OPERATION_IN_PROGRESS,
        message: "An operation with the same idempotency key is still running",
      });
    }

    return (existing.response_data || null) as T | null;
  }

  private async persistCompletedIdempotentOperation(params: {
    action: string;
    actorUserId: string;
    idempotencyKey?: string;
    domainId?: string | null;
    requestData?: Record<string, unknown>;
    responseData?: Record<string, unknown>;
  }): Promise<void> {
    if (!params.idempotencyKey) {
      return;
    }

    await this.deps.operations.create({
      userId: params.actorUserId,
      action: params.action,
      domainId: params.domainId || null,
      idempotencyKey: params.idempotencyKey,
      requestData: params.requestData,
      responseData: params.responseData,
      status: "succeeded",
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
      console.warn("[DomainService] Observability event failed", error);
    }
  }

  private async resolveOwnershipMode(input: {
    domain: string;
    userId: string;
  }): Promise<{
    managedByPlatform: boolean;
    source: "purchase_request" | "registrar" | "external";
  }> {
    const candidates = buildManagedZoneCandidates(input.domain);

    for (const candidate of candidates) {
      if (this.deps.purchaseRequests) {
        try {
          const request = await this.deps.purchaseRequests.findLatestByDomain({
            userId: input.userId,
            domain: candidate,
          });
          if (request?.status === "completed") {
            return {
              managedByPlatform: true,
              source: "purchase_request",
            };
          }
        } catch {
          // Keep add-domain flow resilient; fallback to registrar probe and manual TXT.
        }
      }

      try {
        const summary = await this.deps.registrar.getDomainSummary(candidate);
        if (summary?.domainName) {
          return {
            managedByPlatform: true,
            source: "registrar",
          };
        }
      } catch (error: unknown) {
        const serviceError = toDomainServiceError(error);
        if (serviceError.code === DOMAIN_ERROR_CODES.DOMAIN_NOT_FOUND) {
          continue;
        }
        // Do not block adding external domains if registrar metadata lookup fails.
      }
    }

    return {
      managedByPlatform: false,
      source: "external",
    };
  }
}

function shouldSkipManagedDnsAutomation(error: DomainServiceError): boolean {
  return (
    error.code === DOMAIN_ERROR_CODES.DOMAIN_INVALID
    && /No (platform-managed DNS|managed) zone found/i.test(error.message)
  );
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\/.*$/, "");
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

function buildManagedZoneCandidates(domain: string): string[] {
  const labels = domain.split(".").map((label) => label.trim()).filter(Boolean);
  if (labels.length < 2) {
    return [domain];
  }

  const candidates: string[] = [];
  for (let index = 0; index <= labels.length - 2; index += 1) {
    candidates.push(labels.slice(index).join("."));
  }
  return candidates;
}

function normalizeAddDomainResult(input: AddDomainResult): AddDomainResult {
  if (typeof input.verification_required === "boolean") {
    return input;
  }

  const hasInstructions = Boolean(input.verification_instructions);
  return {
    ...input,
    verification_required: hasInstructions,
    managed_zone_detected: !hasInstructions,
    ownership_source: hasInstructions ? "external" : "registrar",
    verification_instructions: input.verification_instructions || null,
  };
}
