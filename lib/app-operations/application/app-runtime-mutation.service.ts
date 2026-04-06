import { Platform_Apps } from "@/lib/supabase/queries";
import { AppOperationError } from "@/lib/app-operations/core/errors";
import {
  createOperationDetails,
  setOperationExecutor,
  setOperationError,
  upsertOperationStep,
} from "@/lib/app-operations/core/operation-details";
import { AppOperationLogger } from "@/lib/app-operations/application/app-operation-logger";
import { AppOperationFinalizer } from "@/lib/app-operations/application/app-operation-finalizer";
import { ResourceMutationLockService } from "@/lib/app-operations/application/resource-mutation-lock.service";
import { ContainerRegistryAdapter } from "@/lib/app-operations/integrations/container-registry.adapter";
import { AppDeploymentRepository } from "@/lib/app-operations/persistence/app-deployment.repository";
import type {
  AppOperationResult,
  ResourceMutationLockRecord,
} from "@/lib/app-operations/core/types";

export class AppRuntimeMutationService {
  constructor(
    private readonly deployments = new AppDeploymentRepository(),
    private readonly finalizer = new AppOperationFinalizer(),
    private readonly locks = new ResourceMutationLockService(),
    private readonly registry = new ContainerRegistryAdapter(),
    private readonly logger = new AppOperationLogger({})
  ) {}

  private async setAppBuilding(appId: string) {
    const result = await Platform_Apps.update(appId, {
      status: "building",
      last_failure_reason: null,
    });
    if (!result.success) {
      throw new Error(result.error || "Failed to update app status to building");
    }
  }

  private async restoreAppState(appId: string, appStatus?: string | null) {
    const targetStatus = appStatus ?? "failed";
    const result = await Platform_Apps.update(appId, {
      status: targetStatus,
      last_failure_reason: null,
    });
    if (!result.success) {
      throw new Error(result.error || "Failed to restore app state");
    }
  }

  private async failStart(params: {
    operationId: string;
    appId: string;
    appStatus?: string | null;
    details: ReturnType<typeof createOperationDetails>;
    statusCode: number;
    code: string;
    message: string;
    lockId: string;
    onTriggerFailure?: () => Promise<void>;
  }): Promise<never> {
    let cleanupError: string | null = null;

    try {
      await this.deployments.updateById({
        operationId: params.operationId,
        status: "failed",
        failureReason: params.message,
        operationDetails: params.details,
      });
    } catch (error) {
      cleanupError = error instanceof Error ? error.message : String(error);
    }

    try {
      await this.restoreAppState(params.appId, params.appStatus);
    } catch (error) {
      cleanupError = cleanupError ?? (error instanceof Error ? error.message : String(error));
    }

    if (params.onTriggerFailure) {
      try {
        await params.onTriggerFailure();
      } catch (error) {
        cleanupError = cleanupError ?? (error instanceof Error ? error.message : String(error));
      }
    }

    try {
      await this.locks.releaseAppMutationLock(params.lockId);
    } catch (error) {
      cleanupError = cleanupError ?? (error instanceof Error ? error.message : String(error));
    }

    if (cleanupError) {
      this.logger.error("Runtime mutation cleanup encountered an error", {
        operation_id: params.operationId,
        cleanup_error: cleanupError,
      });
    }

    throw new AppOperationError({
      code: params.code,
      message: params.message,
      statusCode: params.statusCode,
    });
  }

  async rollback(params: {
    appId: string;
    appName: string;
    appStatus?: string | null;
    activeDeploymentId?: string | null;
    commitSha?: string | null;
    rollbackTargetBuildNumber: number;
    targetDeploymentId: string;
    imageRef: string;
    imageTag?: string | null;
    imageDigest?: string | null;
    idempotencyKey?: string | null;
    executor: () => Promise<void>;
  }): Promise<AppOperationResult> {
    if (params.idempotencyKey) {
      const existing = await this.deployments.findByIdempotencyKey(
        params.appId,
        params.idempotencyKey
      );
      if (existing) {
        return {
          operation: existing,
          buildNumber: existing.rollback_target_build_number,
          reused: true,
        };
      }
    }

    let lock: ResourceMutationLockRecord;
    try {
      lock = await this.locks.acquireAppMutationLock({
        appId: params.appId,
        appName: params.appName,
        appStatus: params.appStatus,
        holder: "rollback",
        metadata: {
          operation_type: "rollback",
          target_build_number: params.rollbackTargetBuildNumber,
          idempotency_key: params.idempotencyKey ?? null,
        },
      });
    } catch (error) {
      if (params.idempotencyKey) {
        const existing = await this.deployments.findByIdempotencyKey(
          params.appId,
          params.idempotencyKey
        );
        if (existing) {
          return {
            operation: existing,
            buildNumber: existing.rollback_target_build_number,
            reused: true,
          };
        }
      }
      throw error;
    }

    let imageAvailability: Awaited<ReturnType<ContainerRegistryAdapter["verifyImageExists"]>>;
    try {
      imageAvailability = await this.registry.verifyImageExists(params.imageRef);
    } catch (error) {
      try { await this.locks.releaseAppMutationLock(lock.id); } catch { /* best effort */ }
      throw new AppOperationError({
        code: "ROLLBACK_IMAGE_UNAVAILABLE",
        message:
          error instanceof Error
            ? `Failed to verify rollback image: ${error.message}`
            : "Failed to verify rollback image",
        statusCode: 409,
      });
    }
    if (!imageAvailability.exists) {
      try { await this.locks.releaseAppMutationLock(lock.id); } catch { /* best effort */ }
      throw new AppOperationError({
        code: "ROLLBACK_IMAGE_UNAVAILABLE",
        message: imageAvailability.reason,
        statusCode: 409,
      });
    }

    let details = createOperationDetails({
      type: "rollback",
      trigger: "rollback",
      target: {
        deployment_id: params.targetDeploymentId,
        build_number: params.rollbackTargetBuildNumber,
        image_ref: params.imageRef,
      },
      steps: [
        {
          key: "preflight",
          label: "Verify rollback target",
          status: "success",
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
        },
        {
          key: "apply",
          label: "Apply change",
          status: "pending",
        },
      ],
    });

    let created: Awaited<ReturnType<AppDeploymentRepository["createIdempotent"]>>;
    try {
      created = await this.deployments.createIdempotent({
        appId: params.appId,
        status: "building",
        trigger: "rollback",
        commitSha: params.commitSha ?? null,
        imageTag: params.imageTag ?? null,
        imageDigest: params.imageDigest ?? null,
        rollbackTargetBuildNumber: params.rollbackTargetBuildNumber,
        idempotencyKey: params.idempotencyKey ?? null,
        operationDetails: details,
      });
    } catch (error) {
      try { await this.locks.releaseAppMutationLock(lock.id); } catch { /* best effort */ }
      throw error;
    }
    const operation = created.record;

    if (created.reused) {
      try { await this.locks.releaseAppMutationLock(lock.id); } catch { /* best effort */ }
      return {
        operation,
        buildNumber: operation.rollback_target_build_number,
        reused: true,
      };
    }

    const logger = this.logger.child({
      app_id: params.appId,
      app_name: params.appName,
      operation_id: operation.id,
      target_build_number: params.rollbackTargetBuildNumber,
    });

    try {
      await this.locks.attachOperationToLock(lock.id, operation.id);
      await this.setAppBuilding(params.appId);

      details = upsertOperationStep(details, {
        key: "apply",
        label: "Apply change",
        status: "running",
      });
      await this.deployments.updateById({
        operationId: operation.id,
        operationDetails: details,
      });

      await params.executor();

      const updated = await this.finalizer.finalizeRuntimeOperation({
        operationId: operation.id,
        appId: params.appId,
        appName: params.appName,
        trigger: "rollback",
        commitSha: params.commitSha ?? null,
        activeDeploymentId: params.targetDeploymentId,
        status: "success",
      });

      logger.info("Rollback applied", {
        active_deployment_id: params.targetDeploymentId,
      });

      return {
        operation: updated,
        buildNumber: params.rollbackTargetBuildNumber,
        reused: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Rollback failed";
      details = setOperationError(details, {
        code: "ROLLBACK_FAILED",
        message,
        retryable: false,
      });
      details = upsertOperationStep(details, {
        key: "apply",
        label: "Apply change",
        status: "failed",
        message,
      });
      await this.deployments.updateById({
        operationId: operation.id,
        operationDetails: details,
      });

      logger.error("Rollback failed", { error: message });

      return this.failStart({
        operationId: operation.id,
        appId: params.appId,
        appStatus: params.appStatus,
        details,
        code: "ROLLBACK_FAILED",
        message,
        statusCode: 500,
        lockId: lock.id,
      });
    }
  }

  async resize(params: {
    appId: string;
    appName: string;
    appStatus?: string | null;
    currentSize: "small" | "medium" | "large";
    targetSize: "small" | "medium" | "large";
    idempotencyKey?: string | null;
    executor: (operationId: string) => Promise<{
      buildNumber: number;
      executor: {
        type: "jenkins";
        job_name: string;
        run_number: number;
        url?: string;
      };
    }>;
    onBeforeTrigger?: () => Promise<void>;
    onAfterTrigger?: (buildNumber: number) => Promise<void>;
    onTriggerFailure?: () => Promise<void>;
  }): Promise<AppOperationResult> {
    if (params.idempotencyKey) {
      const existing = await this.deployments.findByIdempotencyKey(
        params.appId,
        params.idempotencyKey
      );
      if (existing) {
        return {
          operation: existing,
          buildNumber: existing.build_number,
          reused: true,
        };
      }
    }

    let lock: ResourceMutationLockRecord;
    try {
      lock = await this.locks.acquireAppMutationLock({
        appId: params.appId,
        appName: params.appName,
        appStatus: params.appStatus,
        holder: "resize",
        metadata: {
          operation_type: "resize",
          source_size: params.currentSize,
          target_size: params.targetSize,
          idempotency_key: params.idempotencyKey ?? null,
        },
      });
    } catch (error) {
      if (params.idempotencyKey) {
        const existing = await this.deployments.findByIdempotencyKey(
          params.appId,
          params.idempotencyKey
        );
        if (existing) {
          return {
            operation: existing,
            buildNumber: existing.build_number,
            reused: true,
          };
        }
      }
      throw error;
    }

    let details = createOperationDetails({
      type: "resize",
      trigger: "resize",
      source: { size: params.currentSize },
      target: { size: params.targetSize },
      steps: [
        {
          key: "prepare",
          label: "Prepare resize",
          status: "success",
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
        },
        {
          key: "trigger",
          label: "Trigger executor",
          status: "pending",
        },
      ],
    });

    let created: Awaited<ReturnType<AppDeploymentRepository["createIdempotent"]>>;
    try {
      created = await this.deployments.createIdempotent({
        appId: params.appId,
        status: "building",
        trigger: "resize",
        idempotencyKey: params.idempotencyKey ?? null,
        operationDetails: details,
      });
    } catch (error) {
      try { await this.locks.releaseAppMutationLock(lock.id); } catch { /* best effort */ }
      throw error;
    }
    const operation = created.record;

    if (created.reused) {
      try { await this.locks.releaseAppMutationLock(lock.id); } catch { /* best effort */ }
      return {
        operation,
        buildNumber: operation.build_number,
        reused: true,
      };
    }

    try {
      await this.locks.attachOperationToLock(lock.id, operation.id);
      await this.setAppBuilding(params.appId);

      if (params.onBeforeTrigger) {
        await params.onBeforeTrigger();
      }

      details = upsertOperationStep(details, {
        key: "trigger",
        label: "Trigger executor",
        status: "running",
      });
      await this.deployments.updateById({
        operationId: operation.id,
        operationDetails: details,
      });

      const execution = await params.executor(operation.id);
      details = setOperationExecutor(details, execution.executor);
      details = upsertOperationStep(details, {
        key: "trigger",
        label: "Trigger executor",
        status: "success",
      });

      const updated = await this.deployments.updateById({
        operationId: operation.id,
        buildNumber: execution.buildNumber,
        operationDetails: details,
      });

      if (params.onAfterTrigger) {
        try {
          await params.onAfterTrigger(execution.buildNumber);
        } catch (error) {
          this.logger.child({
            app_id: params.appId,
            app_name: params.appName,
            operation_id: operation.id,
          }).warn("Resize post-trigger hook failed", {
            build_number: execution.buildNumber,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        operation: updated,
        buildNumber: execution.buildNumber,
        reused: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Resize failed";
      details = setOperationError(details, {
        code: "RESIZE_TRIGGER_FAILED",
        message,
        retryable: false,
      });
      details = upsertOperationStep(details, {
        key: "trigger",
        label: "Trigger executor",
        status: "failed",
        message,
      });
      await this.deployments.updateById({
        operationId: operation.id,
        status: "failed",
        failureReason: message,
        operationDetails: details,
      });

      this.logger.child({
        app_id: params.appId,
        app_name: params.appName,
        operation_id: operation.id,
      }).error("Resize trigger failed", {
        error: message,
      });

      return this.failStart({
        operationId: operation.id,
        appId: params.appId,
        appStatus: params.appStatus,
        details,
        code: "RESIZE_TRIGGER_FAILED",
        message,
        statusCode: 500,
        lockId: lock.id,
        onTriggerFailure: params.onTriggerFailure,
      });
    }
  }
}
