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
  DomainOperationRepositoryPort,
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
}

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
  }): Promise<{
    domain: DomainRecord;
    verification_instructions: {
      record_type: "TXT";
      record_name: string;
      record_value: string;
      ttl: number;
    };
  }> {
    const cleanDomain = normalizeDomain(input.domain);
    ensureDomainFormat(cleanDomain);

    const fromIdempotency = await this.tryIdempotentResult<{
      domain: DomainRecord;
      verification_instructions: {
        record_type: "TXT";
        record_name: string;
        record_value: string;
        ttl: number;
      };
    }>(input.actor.userId, "domain.add", input.idempotencyKey);
    if (fromIdempotency) {
      return fromIdempotency;
    }

    await this.deps.appRead.getOwnedApp(input.appId, input.actor.userId);

    const existing = await this.deps.domains.findActiveByDomain(cleanDomain);
    if (existing && existing.status !== "removed") {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_ALREADY_IN_USE,
        message:
          existing.app_id === input.appId
            ? "This domain is already added to this app"
            : "This domain is already in use by another app",
      });
    }

    // Optional registrar read (best effort metadata check for managed domains).
    try {
      await this.deps.registrar.getDomainSummary(cleanDomain);
    } catch {
      // Ignore registrar lookup failures here; activation handles integration errors explicitly.
    }

    const verificationToken = `verify_${randomBytes(8).toString("hex")}`;
    const domain = await this.deps.domains.createPending({
      appId: input.appId,
      userId: input.actor.userId,
      domain: cleanDomain,
      verificationToken,
    });

    const response = {
      domain,
      verification_instructions: {
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

    return response;
  }

  async verifyDomain(input: {
    actor: ActorContext;
    domainId: string;
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

    if (domain.status === "active" || domain.status === "verified") {
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

    void this.processActivationOperation(operation.id, input.actor.userId);

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

  private async processActivationOperation(operationId: string, userId: string): Promise<void> {
    try {
      const operation = await this.deps.operations.findByIdForUser(operationId, userId);
      if (!operation || !operation.domain_id) {
        return;
      }

      await this.deps.operations.markRunning(operation.id);

      const domain = await this.getOwnedDomain(operation.domain_id, userId);
      const app = await this.deps.appRead.getOwnedApp(domain.app_id, userId);

      const cnameTarget = `${app.slug}.${APP_DOMAIN}`;

      await this.deps.dns.ensureCnameRecord({
        fqdn: domain.domain,
        target: cnameTarget,
        ttl: 300,
      });

      await this.deps.ingress.addDomainToAppIngress(app.name, domain.domain);
      const updated = await this.deps.domains.markActive(domain.id);

      await this.deps.operations.markSucceeded(operation.id, {
        domain_id: updated.id,
        status: updated.status,
        activated_at: updated.activated_at,
      });
    } catch (error: unknown) {
      const serviceError = toDomainServiceError(error);

      try {
        const operation = await this.deps.operations.findByIdForUser(operationId, userId);
        if (operation?.domain_id) {
          await this.deps.domains.updateLastError(operation.domain_id, serviceError.message);
        }

        await this.deps.operations.markFailed({
          operationId,
          code: serviceError.code,
          message: serviceError.message,
          retryable: serviceError.retryable,
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
