import { randomBytes } from "crypto";
import { APP_DOMAIN, DOMAIN_VERIFY_PREFIX } from "@/config/domain";
import {
  DOMAIN_ERROR_CODES,
  type DomainErrorCode,
  DomainServiceError,
  toDomainServiceError,
} from "@/lib/domain-service/core/errors";
import type {
  AppReadPort,
  AppWritePort,
  DnsProviderPort,
  DnsRoutingPort,
  DomainAuditLogPort,
  DomainEmailPort,
  DomainNotificationPort,
  DomainOperationRepositoryPort,
  DomainPurchaseRequestRepositoryPort,
  DomainRegistrarPort,
  DomainRepositoryPort,
  IngressPort,
  SslProbePort,
} from "@/lib/domain-service/core/ports";
import type {
  ActorContext,
  DomainOperation,
  DomainRecord,
  DomainRecordWithRouting,
} from "@/lib/domain-service/core/types";
import {
  DomainAppMutationGuard,
  getDomainOperationLockId,
} from "@/lib/domain-service/application/domain-app-mutation-guard";

// If an activation operation is still "running" beyond this threshold, the
// server likely restarted mid-Jenkins-job. Auto-fail it so the frontend stops
// polling and the user can retry. Must exceed Jenkins max build duration (120s).
const STALE_OPERATION_MS = 3 * 60 * 1000; // 3 minutes
const SSL_ISSUING_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes

interface DomainServiceDeps {
  appRead: AppReadPort;
  appWrite?: AppWritePort;
  domains: DomainRepositoryPort;
  operations: DomainOperationRepositoryPort;
  registrar: DomainRegistrarPort;
  dns: DnsProviderPort;
  dnsRouting?: DnsRoutingPort;
  ingress: IngressPort;
  /** Probes the live TLS certificate of a custom domain. Optional — if omitted, ssl_status stays "issuing" until manually checked. */
  sslProbe?: SslProbePort;
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
  private readonly appMutationGuard = new DomainAppMutationGuard();

  constructor(private readonly deps: DomainServiceDeps) {}

  async listDomains(input: { actor: ActorContext; appId?: string }): Promise<DomainRecordWithRouting[]> {
    if (input.appId !== undefined) {
      await this.deps.appRead.getOwnedApp(input.appId, input.actor.userId);
    }
    const records = await this.deps.domains.listByApp(input.appId, input.actor.userId);

    if (!this.deps.dnsRouting) {
      return records.map((r) => ({
        ...r,
        dns_ready: true,
        dns_message: "",
        dns_resolved_ips: [],
        dns_expected_ips: [],
      }));
    }

    const routing = this.deps.dnsRouting;
    return Promise.all(
      records.map(async (r) => {
        try {
          const status = await routing.getRoutingStatus(r.domain);
          return {
            ...r,
            dns_ready: status.ready,
            dns_message: status.message,
            dns_resolved_ips: status.resolved_ips,
            dns_expected_ips: status.expected_ips,
          };
        } catch {
          return {
            ...r,
            dns_ready: false,
            dns_message: "DNS routing check failed.",
            dns_resolved_ips: [],
            dns_expected_ips: [],
          };
        }
      })
    );
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

    // Load app first (authorization + needed for mutation lock)
    const app = await this.deps.appRead.getOwnedApp(input.appId, input.actor.userId);

    return this.appMutationGuard.withAppMutationLock({
      app,
      holder: "domain_add",
      metadata: { domain: cleanDomain, action: "domain.add" },
      run: async () => {
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
                record_name: `${DOMAIN_VERIFY_PREFIX}.${cleanDomain}`,
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
      },
    });
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

    const recordName = `${DOMAIN_VERIFY_PREFIX}.${domain.domain}`;
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
    const app = await this.deps.appRead.getOwnedApp(domain.app_id, input.actor.userId);
    this.appMutationGuard.assertAppRunning(app);
    if (domain.status !== "verified" && domain.status !== "active") {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.DOMAIN_NOT_VERIFIED,
        message: `Domain must be verified before activation. Current status: ${domain.status}`,
      });
    }

    const appMutationLock = await this.appMutationGuard.acquireForAsyncDomainOperation({
      app,
      holder: "domain_activate",
      metadata: {
        domain_id: domain.id,
        domain: domain.domain,
        action: "domain.activate",
      },
      ttlMs: STALE_OPERATION_MS + 2 * 60 * 1000,
    });

    try {
      const operation = await this.deps.operations.create({
        userId: input.actor.userId,
        action: "domain.activate",
        domainId: domain.id,
        idempotencyKey: input.idempotencyKey,
        requestData: {
          domain_id: input.domainId,
          app_id: app.id,
          app_mutation_lock_id: appMutationLock.id,
        },
        status: "pending",
      });

      return operation;
    } catch (error) {
      await this.appMutationGuard.release(appMutationLock.id).catch(() => {});
      throw error;
    }
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

    await this.syncPrimaryDomainCache(domain.app_id, updated.domain);

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

    return this.appMutationGuard.withAppMutationLock({
      app,
      holder: "domain_remove",
      metadata: {
        domain_id: domain.id,
        domain: domain.domain,
        action: "domain.remove",
      },
      run: async () => {
        // Use app.name (not app.slug): the platform DNS A record is <name>.APP_DOMAIN,
        // not <slug>.APP_DOMAIN. The slug includes a hash suffix that has no specific A record.
        const cnameTarget = `${app.name}.${APP_DOMAIN}`;

        if (shouldAttemptRoutingCleanup(domain.status)) {
          try {
            await this.deps.ingress.removeDomainFromAppIngress(app.name, domain.domain);
          } catch (error: unknown) {
            const integrationError = toDomainServiceError(error);
            if (domain.status === "active") {
              throw new DomainServiceError({
                code: DOMAIN_ERROR_CODES.INTEGRATION_CONFIG_ERROR,
                message: "Failed to remove domain mapping. Please retry.",
                retryable: integrationError.retryable ?? true,
              });
            }

            console.warn("[DomainService] Ingress cleanup skipped during non-active removal", {
              domainId: domain.id,
              domain: domain.domain,
              status: domain.status,
              errorCode: integrationError.code,
              errorMessage: integrationError.message,
            });
          }

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

        // Update app-level denormalised fields so deployment pipeline stays in sync.
        await this.emitNonBlocking(async () => {
          if (this.deps.appWrite) {
            await this.deps.appWrite.clearCustomDomain(domain.app_id, domain.domain).catch((err) => {
              console.error("[DomainService] clearCustomDomain failed", err);
            });
          }
        });

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
      },
    });
  }

  async getRegistrarSettings(input: { actor: ActorContext; domainId: string }) {
    const domain = await this.getOwnedDomain(input.domainId, input.actor.userId);
    const managed = await this.deps.registrar.resolveZone(domain.domain);
    if (!managed) return { managed: false as const, domain: domain.domain };
    const s = await this.deps.registrar.getRegistrarSettings(managed.zone);
    return { managed: true as const, domain: domain.domain, zone: managed.zone, autorenew_enabled: s.autorenewEnabled, locked: s.locked, privacy_enabled: s.privacyEnabled, expires_at: s.expireDate };
  }

  async updateRegistrarSettings(input: {
    actor: ActorContext;
    domainId: string;
    updates: { autorenew_enabled?: boolean; locked?: boolean; privacy_enabled?: boolean };
  }) {
    const domain = await this.getOwnedDomain(input.domainId, input.actor.userId);
    const managed = await this.deps.registrar.resolveZone(domain.domain);
    if (!managed) return { managed: false as const, domain: domain.domain };

    // Persist autorenew preference BEFORE calling the registrar so that if the
    // DB write fails the user gets a 500 with no registrar change (retryable).
    // If we called Name.com first and the DB write failed, the registrar would be
    // updated but the cron would still charge the user (stale DB value).
    if (input.updates.autorenew_enabled !== undefined && this.deps.purchaseRequests) {
      const req = await this.deps.purchaseRequests!.findLatestByDomain({ userId: input.actor.userId, domain: managed.zone });
      if (req) await this.deps.purchaseRequests!.updateStatus({ requestId: req.id, status: req.status, metadata: { autorenew_enabled: input.updates.autorenew_enabled } });
    }

    const s = await this.deps.registrar.updateRegistrarSettings(managed.zone, {
      autorenewEnabled: input.updates.autorenew_enabled,
      locked: input.updates.locked,
      privacyEnabled: input.updates.privacy_enabled,
    });

    await this.emitNonBlocking(async () => {
      await this.emitAudit({ actor: input.actor, action: "update", serviceId: domain.id, serviceName: domain.domain, metadata: { event: "registrar_settings_updated", ...input.updates } });
      await this.emitNotification({ userId: input.actor.userId, action: "updated", serviceName: domain.domain, serviceId: domain.id, type: "info", metadata: { event: "registrar_settings_updated", ...input.updates } });
    });

    return { managed: true as const, domain: domain.domain, zone: managed.zone, autorenew_enabled: s.autorenewEnabled, locked: s.locked, privacy_enabled: s.privacyEnabled, expires_at: s.expireDate };
  }

  async checkSslStatus(input: {
    actor: ActorContext;
    domainId: string;
  }): Promise<{ ssl_status: DomainRecord["ssl_status"]; dns_ready?: boolean; dns_message?: string }> {
    const domain = await this.getOwnedDomain(input.domainId, input.actor.userId);

    // Only probe if the domain is active and SSL has not yet been confirmed.
    if (domain.status !== "active" || domain.ssl_status === "active") {
      return { ssl_status: domain.ssl_status };
    }

    const activatedAtMs = domain.activated_at ? new Date(domain.activated_at).getTime() : null;
    const issuingTooLong =
      typeof activatedAtMs === "number" &&
      !Number.isNaN(activatedAtMs) &&
      Date.now() - activatedAtMs > SSL_ISSUING_TIMEOUT_MS;

    // DNS routing check is ADVISORY only — cert-manager uses the cluster's
    // internal CoreDNS which may resolve the domain correctly even when our
    // application-level public DNS check hasn't caught up yet (e.g. Google DNS
    // negative-cache NXDOMAIN, propagation lag, different resolver behaviour).
    // We always proceed to the TLS probe so a cert-manager success is detected
    // immediately rather than being blocked until DNS appears "ready" here.
    const dnsStatus = this.deps.dnsRouting
      ? await this.deps.dnsRouting.getRoutingStatus(domain.domain).catch(() => null)
      : null;

    // True only when KUBE_IP is configured AND we can confirm DNS is wrong.
    const dnsKnownNotReady =
      dnsStatus !== null && !dnsStatus.ready && dnsStatus.expected_ips.length > 0;

    if (!this.deps.sslProbe) {
      // No TLS probe adapter wired — use DNS check for timeout enforcement only.
      if (dnsKnownNotReady && issuingTooLong) {
        const message =
          "SSL setup timed out: DNS is not pointing to the platform. Verify your DNS records point to the correct IP, then re-activate.";
        await this.deps.domains.updateSslStatus(domain.id, "failed").catch(() => {});
        await this.deps.domains.updateLastError(domain.id, message).catch(() => {});
        return { ssl_status: "failed", dns_ready: false, dns_message: message };
      }
      return {
        ssl_status: domain.ssl_status,
        ...(dnsKnownNotReady && { dns_ready: false, dns_message: dnsStatus!.message }),
      };
    }

    // Always probe TLS — cert-manager may have obtained the cert already.
    const cert = await this.deps.sslProbe.probe(domain.domain);

    if (!cert) {
      // Could not reach the host or TLS handshake failed entirely.
      if (issuingTooLong) {
        const message = dnsKnownNotReady
          ? "SSL setup timed out: DNS is not pointing to the platform. Verify your DNS records point to the correct IP, then re-activate."
          : "SSL setup timed out. The domain is unreachable. Re-activate the domain to retry.";
        await this.deps.domains.updateSslStatus(domain.id, "failed").catch(() => {});
        await this.deps.domains.updateLastError(domain.id, message).catch(() => {});
        return { ssl_status: "failed", dns_ready: !dnsKnownNotReady, dns_message: message };
      }
      if (dnsKnownNotReady) {
        await this.deps.domains
          .updateLastError(domain.id, `DNS not ready: ${dnsStatus!.message}`)
          .catch(() => {});
        return { ssl_status: domain.ssl_status, dns_ready: false, dns_message: dnsStatus!.message };
      }
      return { ssl_status: domain.ssl_status, dns_ready: true };
    }

    const { issuer: issuerStr } = cert;
    const isFakeCert =
      issuerStr.includes("kubernetes ingress") ||
      issuerStr.includes("fake") ||
      issuerStr.includes("ingress-nginx") ||
      issuerStr.includes("self-signed");
    const isLetsEncrypt =
      issuerStr.includes("let") && (issuerStr.includes("encrypt") || issuerStr.includes("lencr"));
    const hostnameMatches = certCoversHostname(cert, domain.domain);

    if (isLetsEncrypt && hostnameMatches) {
      await this.deps.domains.updateSslStatus(domain.id, "active");
      await this.deps.domains.updateLastError(domain.id, null).catch(() => {});
      return { ssl_status: "active", dns_ready: true };
    }

    if (isLetsEncrypt && !hostnameMatches) {
      return {
        ssl_status: domain.ssl_status,
        dns_ready: true,
        dns_message: "A valid secure endpoint was found, but for a different hostname. Waiting for this exact domain to become ready.",
      };
    }

    if (isFakeCert && domain.ssl_status !== "failed") {
      if (issuingTooLong) {
        const message =
          "Secure connection setup timed out. The domain is reachable but not fully trusted yet. Re-activate the domain to retry.";
        await this.deps.domains.updateSslStatus(domain.id, "failed").catch(() => {});
        await this.deps.domains.updateLastError(domain.id, message).catch(() => {});
        return { ssl_status: "failed", dns_ready: true, dns_message: message };
      }
      // Keep as "issuing" — cert-manager has not finished yet.
      return { ssl_status: "issuing", dns_ready: true };
    }

    return { ssl_status: domain.ssl_status, dns_ready: true };
  }

  async getOperation(input: { actor: ActorContext; operationId: string }): Promise<DomainOperation> {
    const operation = await this.deps.operations.findByIdForUser(input.operationId, input.actor.userId);

    if (!operation) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.OPERATION_NOT_FOUND,
        message: "Operation not found",
      });
    }

    // If the operation is stuck in "pending" or "running" (server restarted before
    // or during the activation run), fail it now so the frontend stops polling and
    // the app-level mutation lock is released for retry.
    if (operation.status === "pending" || operation.status === "running") {
      const referenceTime =
        operation.status === "running" ? operation.started_at || operation.created_at : operation.created_at;
      const ageMs = Date.now() - new Date(referenceTime).getTime();
      if (ageMs > STALE_OPERATION_MS) {
        const errorMessage =
          "Activation did not complete — the server may have restarted. Please try activating again.";
        await this.deps.operations
          .markFailed({
            operationId: operation.id,
            code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
            message: errorMessage,
            retryable: true,
          })
          .catch(() => {});

        await this.appMutationGuard
          .release(getDomainOperationLockId(operation.request_data))
          .catch(() => {});

        return {
          ...operation,
          status: "failed",
          error_code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
          error_message: errorMessage,
          retryable: true,
          finished_at: new Date().toISOString(),
        };
      }
    }

    return operation;
  }

  async runActivationOperation(operationId: string, actor: ActorContext): Promise<void> {
    const userId = actor.userId;
    let appMutationLockId: string | null = null;
    try {
      console.log("[DomainService] Activation run started", {
        operationId,
        userId,
      });
      const operation = await this.deps.operations.findByIdForUser(operationId, userId);
      if (!operation || !operation.domain_id) {
        console.warn("[DomainService] Activation operation missing or not owned", {
          operationId,
          userId,
        });
        return;
      }

      appMutationLockId = getDomainOperationLockId(operation.request_data);

      await this.deps.operations.markRunning(operation.id);
      console.log("[DomainService] Activation operation marked running", {
        operationId: operation.id,
        domainId: operation.domain_id,
      });

      const domain = await this.getOwnedDomain(operation.domain_id, userId);
      const app = await this.deps.appRead.getOwnedApp(domain.app_id, userId);
      const trace = {
        operationId: operation.id,
        domainId: domain.id,
        domain: domain.domain,
        appId: app.id,
        appName: app.name,
      };
      console.log("[DomainService] Activation context resolved", trace);

      // Mark TLS as issuing now that we're committing to the activation path.
      await this.deps.domains.updateSslStatus(domain.id, "issuing").catch(() => {});
      console.log("[DomainService] SSL status set to issuing", trace);

      // Use app.name (not app.slug): the platform DNS A record is <name>.APP_DOMAIN,
      // not <slug>.APP_DOMAIN. The slug includes a hash suffix that has no specific A record.
      const cnameTarget = `${app.name}.${APP_DOMAIN}`;
      const routingIps = parseRoutingIps();
      const isApexDomain = domain.domain.split(".").filter(Boolean).length <= 2;
      let dnsAutoConfigured = true;
      let dnsAutomationMessage: string | null = null;

      try {
        console.log("[DomainService] Ensuring DNS routing record", {
          ...trace,
          cnameTarget,
        });
        await this.deps.dns.ensureRoutingRecord({
          fqdn: domain.domain,
          target: cnameTarget,
          ttl: 300,
        });
        console.log("[DomainService] DNS routing ensured", trace);
      } catch (error: unknown) {
        const dnsError = toDomainServiceError(error);
        if (!shouldSkipManagedDnsAutomation(dnsError)) {
          console.error("[DomainService] DNS automation failed (fatal)", {
            ...trace,
            errorCode: dnsError.code,
            errorMessage: dnsError.message,
          });
          throw dnsError;
        }
        dnsAutoConfigured = false;
        dnsAutomationMessage = dnsError.message;
        console.warn("[DomainService] DNS automation skipped (managed-zone fallback)", {
          ...trace,
          errorCode: dnsError.code,
          errorMessage: dnsError.message,
        });
      }

      console.log("[DomainService] Applying ingress domain mapping", trace);
      await this.deps.ingress.addDomainToAppIngress(app.name, domain.domain);
      console.log("[DomainService] Ingress domain mapping applied", trace);
      const updated = await this.deps.domains.markActive(domain.id);
      console.log("[DomainService] Domain marked active", {
        ...trace,
        activatedAt: updated.activated_at,
        dnsAutoConfigured,
        dnsAutomationMessage,
      });
      // ssl_status stays "issuing" (set by markActive) until cert-manager issues the certificate.
      // A background check via /api/domains/[id]/check-ssl will transition it to "active".

      // Update app-level has_custom_domains flag.
      if (this.deps.appWrite) {
        await this.deps.appWrite.setHasCustomDomains(domain.app_id, true).catch((err) => {
          console.error("[DomainService] setHasCustomDomains failed", err);
        });
      }

      await this.deps.operations.markSucceeded(operation.id, {
        domain_id: updated.id,
        status: updated.status,
        activated_at: updated.activated_at,
        dns_auto_configured: dnsAutoConfigured,
        dns_automation_message: dnsAutomationMessage,
        ...(!dnsAutoConfigured && {
          routing_instructions: isApexDomain
            ? {
                record_type: "A",
                record_name: "@",
                record_value: routingIps[0] || "",
                record_values: routingIps,
                ttl: 300,
                note: "Add one A record for each listed platform ingress IP at your DNS provider.",
              }
            : {
                record_type: "CNAME",
                record_name: updated.domain,
                record_value: cnameTarget,
                ttl: 300,
                note: "Add this CNAME record at your DNS provider. If your provider offers proxy or CDN mode, keep the record as direct DNS while SSL issues.",
              },
        }),
      });
      console.log("[DomainService] Activation operation marked succeeded", {
        ...trace,
        dnsAutoConfigured,
        dnsAutomationMessage,
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
      const classified = classifyActivationFailure(serviceError);
      const operationMessage = toOperationErrorMessage(classified.message);
      console.error("[DomainService] Activation run failed", {
        operationId,
        userId,
        errorCode: classified.code,
        errorMessage: operationMessage,
        retryable: classified.retryable,
      });

      try {
        const operation = await this.deps.operations.findByIdForUser(operationId, userId);
        if (operation?.domain_id) {
          await this.deps.domains.updateLastError(operation.domain_id, operationMessage);
        }
        const failedDomain = operation?.domain_id
          ? await this.deps.domains.findByIdForUser(operation.domain_id, userId).catch(() => null)
          : null;

        if (failedDomain && failedDomain.ssl_status !== "active") {
          await this.deps.domains.updateSslStatus(failedDomain.id, "failed").catch(() => {});
        }

        await this.deps.operations.markFailed({
          operationId,
          code: classified.code,
          message: operationMessage,
          retryable: classified.retryable,
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
              error_code: classified.code,
              error_message: operationMessage,
            },
          });
          await this.emitNotification({
            userId,
            action: "failed",
            serviceName: failedDomain?.domain || "domain",
            serviceId: operation?.domain_id || undefined,
            type: "error",
            error: operationMessage,
            metadata: {
              operation_id: operationId,
              error_code: classified.code,
            },
          });
          await this.emitEmail({
            actor,
            severity: "critical",
            alertTitle: "Domain activation failed",
            serviceName: failedDomain?.domain || "domain",
            summary: `Domain activation failed: ${operationMessage}`,
            metadata: {
              operation_id: operationId,
              error_code: classified.code,
            },
          });
        });
      } catch (markError) {
        console.error("[DomainService] Failed to persist operation failure", markError);
      }
    } finally {
      await this.appMutationGuard.release(appMutationLockId).catch((error) => {
        console.error("[DomainService] Failed to release app mutation lock", {
          operationId,
          userId,
          lockId: appMutationLockId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
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

  private async syncPrimaryDomainCache(appId: string, domain: string): Promise<void> {
    if (!this.deps.appWrite) return;

    await this.deps.appWrite.setPrimaryCustomDomain(appId, domain).catch((error) => {
      console.error("[DomainService] setPrimaryCustomDomain failed", error);
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
  // Primary path: dns-provider adapter detected custom nameservers before touching Name.com DNS.
  if (
    error.code === DOMAIN_ERROR_CODES.DOMAIN_INVALID
    && /No (platform-managed DNS|managed) zone found/i.test(error.message)
  ) {
    return true;
  }
  // Safety net: Name.com DNS records API explicitly rejected the write because the
  // domain's nameservers no longer point to Name.com. This happens when the adapter's
  // nameserver pre-check is bypassed (e.g. Name.com returned empty nameservers) and
  // the record operation itself surfaces the authoritativeness error.
  if (/permission denied.*ns not authoritative/i.test(error.message)) {
    return true;
  }
  return false;
}

function parseRoutingIps(): string[] {
  return (process.env.KUBE_IP || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function shouldAttemptRoutingCleanup(status: DomainRecord["status"]): boolean {
  return status === "active" || status === "verified" || status === "failed";
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

function certNameMatchesHost(certName: string, host: string): boolean {
  const normalizedName = normalizeHostname(certName);
  if (!normalizedName) return false;
  if (normalizedName === host) return true;

  if (normalizedName.startsWith("*.")) {
    const suffix = normalizedName.slice(1); // ".example.com"
    if (!host.endsWith(suffix)) return false;
    const hostLabelCount = host.split(".").length;
    const suffixLabelCount = suffix.slice(1).split(".").length;
    return hostLabelCount === suffixLabelCount + 1;
  }

  return false;
}

function certCoversHostname(
  cert: { common_name?: string; sans?: string[] },
  hostname: string
): boolean {
  const normalizedHost = normalizeHostname(hostname);
  const sans = cert.sans ?? [];
  if (sans.length > 0) {
    return sans.some((name) => certNameMatchesHost(name, normalizedHost));
  }
  if (cert.common_name) {
    return certNameMatchesHost(cert.common_name, normalizedHost);
  }
  return false;
}

type ActivationFailure = {
  code: DomainErrorCode;
  message: string;
  retryable: boolean;
};

// name.com error strings that indicate an ICANN Contact Verification Hold.
// Centralised here so a name.com wording change only needs one update.
const CONTACT_VERIFICATION_HOLD_STRINGS = [
  "contact verification hold",
  "parameter value error - contact verification hold",
] as const;

function classifyActivationFailure(error: DomainServiceError): ActivationFailure {
  const raw = error.message || "Domain activation failed.";
  const lower = raw.toLowerCase();

  // Let's Encrypt hard limit: 5 certs per exact domain in 7 days.
  if (
    lower.includes("acme:error:ratelimited")
    || lower.includes("urn:ietf:params:acme:error:ratelimited")
    || (
      lower.includes("too many certificates")
      && (
        lower.includes("last 168h")
        || lower.includes("last 7 days")
        || lower.includes("in the last 7 days")
      )
    )
    || (lower.includes("already issued") && lower.includes("last 7 days"))
  ) {
    const retryAfter = extractRetryAfterUtc(raw);
    return {
      code: DOMAIN_ERROR_CODES.PROVIDER_RATE_LIMITED,
      retryable: true,
      message: retryAfter
        ? `Provider rate limit reached for this domain. Retry after ${retryAfter}.`
        : "Provider rate limit reached for this domain. Please wait before retrying activation.",
    };
  }

  if (
    lower.includes("jenkins: job.create: internal server error")
    || lower.includes("jenkins: job.config: internal server error")
    || (lower.includes("jenkins") && lower.includes("internal server error"))
  ) {
    return {
      code: DOMAIN_ERROR_CODES.INTEGRATION_CONFIG_ERROR,
      retryable: true,
      message: "A platform dependency is temporarily unavailable. Please retry in 1-2 minutes.",
    };
  }

  // Name.com rejects DNS record writes when the domain uses external nameservers.
  // Normally caught by shouldSkipManagedDnsAutomation; this branch is a fallback
  // in case it somehow escapes that check and reaches the failure classifier.
  if (lower.includes("permission denied") && lower.includes("ns not authoritative")) {
    return {
      code: DOMAIN_ERROR_CODES.DOMAIN_INVALID,
      retryable: false,
      message:
        "DNS records could not be configured automatically because this domain uses custom nameservers. " +
        "Add the CNAME (or A) routing record shown above at your DNS provider, then re-activate.",
    };
  }

  if (lower.includes("econnrefused") || lower.includes("enotfound")) {
    if (lower.includes("jenkins")) {
      return {
        code: DOMAIN_ERROR_CODES.INTEGRATION_CONFIG_ERROR,
        retryable: true,
        message: "A platform dependency could not be reached. Please retry in a moment.",
      };
    }
  }

  if (lower.includes("ingress") && lower.includes("not found")) {
    return {
      code: DOMAIN_ERROR_CODES.INTEGRATION_CONFIG_ERROR,
      retryable: true,
      message: "Domain routing for this app is not ready yet. Redeploy or restart the app once, then activate the domain again.",
    };
  }

  if (
    (lower.includes("clusterissuer") && lower.includes("not found"))
    || (lower.includes("cert-manager") && lower.includes("not installed"))
  ) {
    return {
      code: DOMAIN_ERROR_CODES.INTEGRATION_CONFIG_ERROR,
      retryable: false,
      message: "Secure-connection provisioning is not configured in this environment. Contact support.",
    };
  }

  if (lower.includes("timeout waiting for jenkins build")) {
    return {
      code: DOMAIN_ERROR_CODES.INGRESS_APPLY_FAILED,
      retryable: true,
      message: "Domain setup timed out. Please retry activation.",
    };
  }

  if (lower.includes("jenkins build failed with result: failure") || lower.includes("jenkins build failed with result: aborted")) {
    return {
      code: DOMAIN_ERROR_CODES.INGRESS_APPLY_FAILED,
      retryable: true,
      message: "Domain setup failed. Please retry activation.",
    };
  }

  // Contact Verification Hold — ICANN requires the registrant email to be
  // verified after registration. DNS record mutations are blocked until the
  // verification link in the registrar admin inbox is clicked.
  if (CONTACT_VERIFICATION_HOLD_STRINGS.some((s) => lower.includes(s))) {
    return {
      code: DOMAIN_ERROR_CODES.PROVIDER_VALIDATION_FAILED,
      retryable: false,
      message:
        "Domain activation is blocked by a registrar contact-verification hold. " +
        "A verification email was sent to the registrant email address — click the link in that email, then retry activation.",
    };
  }

  return {
    code: error.code,
    message: "Domain setup could not be completed. Please retry.",
    retryable: error.retryable,
  };
}

function extractRetryAfterUtc(message: string): string | null {
  const match = message.match(/retry after\s+([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9:]{8}\s+utc)/i);
  return match?.[1]?.toUpperCase() || null;
}

function toOperationErrorMessage(message: string): string {
  const stripped = message.split("\n--- Jenkins log tail")[0]?.trim() || "Activation failed";
  const MAX = 700;
  if (stripped.length <= MAX) return stripped;
  return `${stripped.slice(0, MAX - 3)}...`;
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
