import { AppOperationError } from "@/lib/app-operations/core/errors";
import { parseOperationDetails } from "@/lib/app-operations/core/operation-details";
import { AppOperationLogger } from "@/lib/app-operations/application/app-operation-logger";
import type { AppMutationCategory, ResourceMutationLockRecord } from "@/lib/app-operations/core/types";
import { AppDeploymentRepository } from "@/lib/app-operations/persistence/app-deployment.repository";
import { ResourceMutationLockRepository } from "@/lib/app-operations/persistence/resource-mutation-lock.repository";

function formatInProgressLabel(params: {
  buildNumber: number | null;
  trigger: string;
  operationType?: string;
  holder?: string | null;
}) {
  const type = params.operationType;
  if (type === "resize" || params.trigger === "resize") {
    return params.buildNumber ? `Resize #${params.buildNumber}` : "Resize";
  }
  if (type === "rollback" || params.trigger === "rollback") {
    return "Rollback";
  }
  if (type === "env_update" || params.holder === "env_update") {
    return "Environment update";
  }
  if (type === "domain_add" || params.holder === "domain_add") {
    return "Domain add";
  }
  if (type === "domain_remove" || params.holder === "domain_remove") {
    return "Domain remove";
  }
  if (params.holder === "delete") {
    return "Delete";
  }
  return params.buildNumber ? `Build #${params.buildNumber}` : "Build";
}

export class ResourceMutationLockService {
  constructor(
    private readonly deployments = new AppDeploymentRepository(),
    private readonly locks = new ResourceMutationLockRepository(),
    private readonly logger = new AppOperationLogger({})
  ) {}

  private async getBlockingDeployment(appId: string) {
    return this.deployments.findLatestInProgressByApp(appId);
  }

  private async getBlockingLock(appId: string, category: AppMutationCategory) {
    return this.locks.findActiveByResource({
      resourceKind: "platform_app",
      resourceId: appId,
      category,
    });
  }

  private buildLockLabel(lock: ResourceMutationLockRecord) {
    const operationType =
      typeof lock.metadata.operation_type === "string" ? lock.metadata.operation_type : undefined;
    const buildNumber =
      typeof lock.metadata.build_number === "number" && Number.isFinite(lock.metadata.build_number)
        ? lock.metadata.build_number
        : null;

    return formatInProgressLabel({
      buildNumber,
      trigger: operationType ?? lock.holder,
      operationType,
      holder: lock.holder,
    });
  }

  private assertMutableAppState(appStatus?: string | null) {
    if (appStatus === "deleting") {
      throw new AppOperationError({
        code: "APP_DELETING",
        message: "App is being deleted and cannot accept changes right now.",
        statusCode: 409,
      });
    }

    if (appStatus === "pending") {
      throw new AppOperationError({
        code: "APP_PENDING",
        message: "App provisioning is still in progress. Please wait before making changes.",
        statusCode: 409,
      });
    }
  }

  private raiseBlockedByDeployment(params: {
    appId: string;
    appName: string;
    buildNumber: number | null;
    trigger: string;
    operationType?: string;
    operationId: string;
  }) {
    const label = formatInProgressLabel({
      buildNumber: params.buildNumber,
      trigger: params.trigger,
      operationType: params.operationType,
    });

    this.logger.child({
      app_id: params.appId,
      app_name: params.appName,
      blocking_operation_id: params.operationId,
    }).warn("Blocked app mutation due to in-progress deployment", {
      label,
      trigger: params.trigger,
      build_number: params.buildNumber,
    });

    throw new AppOperationError({
      code: "APP_OPERATION_IN_PROGRESS",
      message: `${label} is still in progress. Please wait for it to complete.`,
      statusCode: 409,
      retryable: true,
    });
  }

  private raiseBlockedByLock(params: {
    appId: string;
    appName: string;
    lock: ResourceMutationLockRecord;
  }) {
    const label = this.buildLockLabel(params.lock);

    this.logger.child({
      app_id: params.appId,
      app_name: params.appName,
      blocking_lock_id: params.lock.id,
      blocking_operation_id: params.lock.operation_id,
    }).warn("Blocked app mutation due to active mutation lock", {
      label,
      holder: params.lock.holder,
      expires_at: params.lock.expires_at,
    });

    throw new AppOperationError({
      code: "APP_OPERATION_IN_PROGRESS",
      message: `${label} is still in progress. Please wait for it to complete.`,
      statusCode: 409,
      retryable: true,
    });
  }

  async assertAppMutationAllowed(params: {
    appId: string;
    appName: string;
    appStatus?: string | null;
    category?: AppMutationCategory;
  }) {
    const category = params.category ?? "app_mutation";
    this.assertMutableAppState(params.appStatus);

    const inProgress = await this.getBlockingDeployment(params.appId);
    if (inProgress) {
      const details = parseOperationDetails(inProgress.operation_details, {
        trigger: inProgress.trigger,
      });
      this.raiseBlockedByDeployment({
        appId: params.appId,
        appName: params.appName,
        buildNumber: inProgress.build_number,
        trigger: inProgress.trigger,
        operationType: details.type,
        operationId: inProgress.id,
      });
    }

    const lock = await this.getBlockingLock(params.appId, category);
    if (lock) {
      this.raiseBlockedByLock({
        appId: params.appId,
        appName: params.appName,
        lock,
      });
    }
  }

  async acquireAppMutationLock(params: {
    appId: string;
    appName: string;
    appStatus?: string | null;
    category?: AppMutationCategory;
    holder: string;
    metadata?: Record<string, unknown>;
    ttlMs?: number;
  }): Promise<ResourceMutationLockRecord> {
    const category = params.category ?? "app_mutation";
    this.assertMutableAppState(params.appStatus);

    const inProgress = await this.getBlockingDeployment(params.appId);
    if (inProgress) {
      const details = parseOperationDetails(inProgress.operation_details, {
        trigger: inProgress.trigger,
      });
      this.raiseBlockedByDeployment({
        appId: params.appId,
        appName: params.appName,
        buildNumber: inProgress.build_number,
        trigger: inProgress.trigger,
        operationType: details.type,
        operationId: inProgress.id,
      });
    }

    const acquired = await this.locks.acquire({
      resourceKind: "platform_app",
      resourceId: params.appId,
      category,
      holder: params.holder,
      metadata: params.metadata,
      ttlMs: params.ttlMs,
    });

    if (!acquired.lock) {
      if (acquired.conflict) {
        this.raiseBlockedByLock({
          appId: params.appId,
          appName: params.appName,
          lock: acquired.conflict,
        });
      }

      throw new AppOperationError({
        code: "APP_OPERATION_IN_PROGRESS",
        message: "Another app mutation is already in progress.",
        statusCode: 409,
        retryable: true,
      });
    }

    this.logger.child({
      app_id: params.appId,
      app_name: params.appName,
      lock_id: acquired.lock.id,
      holder: params.holder,
    }).info("Acquired app mutation lock");

    return acquired.lock;
  }

  async attachOperationToLock(lockId: string, operationId: string) {
    await this.locks.attachOperation(lockId, operationId);
  }

  async releaseAppMutationLock(lockId: string) {
    await this.locks.release(lockId);
  }

  async releaseAppMutationLockForOperation(operationId: string) {
    await this.locks.releaseByOperationId(operationId);
  }

  async withAppMutationLock<T>(params: {
    appId: string;
    appName: string;
    appStatus?: string | null;
    category?: AppMutationCategory;
    holder: string;
    metadata?: Record<string, unknown>;
    ttlMs?: number;
    run: () => Promise<T>;
  }): Promise<T> {
    const lock = await this.acquireAppMutationLock({
      appId: params.appId,
      appName: params.appName,
      appStatus: params.appStatus,
      category: params.category,
      holder: params.holder,
      metadata: params.metadata,
      ttlMs: params.ttlMs,
    });

    try {
      return await params.run();
    } finally {
      try {
        await this.releaseAppMutationLock(lock.id);
      } catch (error) {
        this.logger.child({
          app_id: params.appId,
          app_name: params.appName,
          lock_id: lock.id,
        }).warn("Failed to release app mutation lock", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
