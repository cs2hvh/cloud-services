import { AppOperationError } from "@/lib/app-operations/core/errors";
import { ResourceMutationLockService } from "@/lib/app-operations/application/resource-mutation-lock.service";
import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";
import type { AppRecord } from "@/lib/domain-service/core/types";
import type { ResourceMutationLockRecord } from "@/lib/app-operations/core/types";

function toDomainMutationConflict(error: AppOperationError): DomainServiceError {
  if (error.code === "APP_DELETING") {
    return new DomainServiceError({
      code: DOMAIN_ERROR_CODES.OPERATION_IN_PROGRESS,
      message: "App is being deleted and domain changes are temporarily unavailable.",
      retryable: error.retryable,
    });
  }

  if (error.code === "APP_PENDING") {
    return new DomainServiceError({
      code: DOMAIN_ERROR_CODES.OPERATION_IN_PROGRESS,
      message: "App provisioning is still in progress. Please wait before changing domains.",
      retryable: error.retryable,
    });
  }

  return new DomainServiceError({
    code: DOMAIN_ERROR_CODES.OPERATION_IN_PROGRESS,
    message: error.message,
    retryable: error.retryable,
  });
}

export class DomainAppMutationGuard {
  constructor(private readonly locks = new ResourceMutationLockService()) {}

  assertAppRunning(app: AppRecord) {
    if (app.status !== "running") {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.APP_NOT_RUNNING,
        message: "The app must be running before custom domains can be activated.",
      });
    }
  }

  async acquireForAsyncDomainOperation(params: {
    app: AppRecord;
    holder: string;
    metadata?: Record<string, unknown>;
    ttlMs?: number;
  }): Promise<ResourceMutationLockRecord> {
    try {
      return await this.locks.acquireAppMutationLock({
        appId: params.app.id,
        appName: params.app.name,
        appStatus: params.app.status,
        holder: params.holder,
        metadata: params.metadata,
        ttlMs: params.ttlMs,
      });
    } catch (error) {
      if (error instanceof AppOperationError) {
        throw toDomainMutationConflict(error);
      }
      throw error;
    }
  }

  async withAppMutationLock<T>(params: {
    app: AppRecord;
    holder: string;
    metadata?: Record<string, unknown>;
    ttlMs?: number;
    run: () => Promise<T>;
  }): Promise<T> {
    try {
      return await this.locks.withAppMutationLock({
        appId: params.app.id,
        appName: params.app.name,
        appStatus: params.app.status,
        holder: params.holder,
        metadata: params.metadata,
        ttlMs: params.ttlMs,
        run: params.run,
      });
    } catch (error) {
      if (error instanceof AppOperationError) {
        throw toDomainMutationConflict(error);
      }
      throw error;
    }
  }

  async release(lockId?: string | null): Promise<void> {
    if (!lockId) return;
    await this.locks.releaseAppMutationLock(lockId);
  }
}

export function getDomainOperationLockId(
  requestData: Record<string, unknown> | null | undefined
): string | null {
  return typeof requestData?.app_mutation_lock_id === "string"
    ? requestData.app_mutation_lock_id
    : null;
}
