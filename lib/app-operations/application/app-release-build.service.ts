import { Platform_Apps } from "@/lib/supabase/queries";
import { AppOperationError } from "@/lib/app-operations/core/errors";
import {
  createOperationDetails,
  parseOperationDetails,
  setOperationError,
  setOperationExecutor,
  upsertOperationStep,
} from "@/lib/app-operations/core/operation-details";
import { AppOperationLogger } from "@/lib/app-operations/application/app-operation-logger";
import type {
  AppDeploymentTrigger,
  AppDeploymentRecord,
  AppOperationDetails,
  AppOperationType,
  AppOperationResult,
  ResourceMutationLockRecord,
} from "@/lib/app-operations/core/types";
import { AppDeploymentRepository } from "@/lib/app-operations/persistence/app-deployment.repository";
import { ResourceMutationLockService } from "@/lib/app-operations/application/resource-mutation-lock.service";

export class AppReleaseBuildService {
  constructor(
    private readonly deployments = new AppDeploymentRepository(),
    private readonly lockService = new ResourceMutationLockService(),
    private readonly logger = new AppOperationLogger({})
  ) {}

  private formatExistingResult(record: AppDeploymentRecord): AppOperationResult {
    return {
      operation: record,
      buildNumber: record.build_number,
      reused: true,
    };
  }

  private async restoreAppState(appId: string, appStatus?: string | null, failureReason?: string | null) {
    const targetStatus = appStatus ?? "failed";
    const result = await Platform_Apps.update(appId, {
      status: targetStatus,
      last_failure_reason: targetStatus === "failed" ? (failureReason ?? null) : null,
    });
    if (!result.success) {
      throw new Error(result.error || "Failed to restore app state");
    }
  }

  private async setAppBuilding(appId: string) {
    const result = await Platform_Apps.update(appId, {
      status: "building",
      last_failure_reason: null,
    });
    if (!result.success) {
      throw new Error(result.error || "Failed to update app status to building");
    }
  }

  private async failOperationStart(params: {
    operationId: string;
    appId: string;
    appStatus?: string | null;
    details: AppOperationDetails;
    message: string;
    lockId: string;
    onTriggerFailure?: () => Promise<void>;
  }) {
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
      await this.restoreAppState(params.appId, params.appStatus, params.message);
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
      await this.lockService.releaseAppMutationLock(params.lockId);
    } catch (error) {
      cleanupError = cleanupError ?? (error instanceof Error ? error.message : String(error));
    }

    if (cleanupError) {
      this.logger.error("Release build cleanup encountered an error", {
        operation_id: params.operationId,
        cleanup_error: cleanupError,
      });
    }
  }

  async startReleaseBuild(params: {
    appId: string;
    appName: string;
    appStatus?: string | null;
    trigger: Extract<AppDeploymentTrigger, "manual" | "webhook">;
    operationType: Extract<AppOperationType, "deploy" | "redeploy">;
    commitSha?: string | null;
    idempotencyKey?: string | null;
    executor: (operation: AppDeploymentRecord) => Promise<{
      buildNumber: number;
      executor: {
        type: "jenkins";
        job_name: string;
        run_number: number;
        url?: string;
      };
    }>;
    onBeforeTrigger?: (operation: AppDeploymentRecord) => Promise<void>;
    onAfterTrigger?: (operation: AppDeploymentRecord, buildNumber: number) => Promise<void>;
    onTriggerFailure?: () => Promise<void>;
  }): Promise<AppOperationResult> {
    if (params.idempotencyKey) {
      const existing = await this.deployments.findByIdempotencyKey(
        params.appId,
        params.idempotencyKey
      );
      if (existing) {
        return this.formatExistingResult(existing);
      }
    }

    let lock: ResourceMutationLockRecord;
    try {
      lock = await this.lockService.acquireAppMutationLock({
        appId: params.appId,
        appName: params.appName,
        appStatus: params.appStatus,
        holder: params.operationType,
        metadata: {
          operation_type: params.operationType,
          trigger: params.trigger,
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
          return this.formatExistingResult(existing);
        }
      }
      throw error;
    }

    let details = createOperationDetails({
      type: params.operationType,
      trigger: params.trigger,
      steps: [
        {
          key: "prepare",
          label: "Prepare deployment",
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
        trigger: params.trigger,
        commitSha: params.commitSha ?? null,
        idempotencyKey: params.idempotencyKey ?? null,
        operationDetails: details,
      });
    } catch (error) {
      try { await this.lockService.releaseAppMutationLock(lock.id); } catch { /* best effort */ }
      throw error;
    }
    const operation = created.record;

    if (created.reused) {
      try { await this.lockService.releaseAppMutationLock(lock.id); } catch { /* best effort */ }
      return this.formatExistingResult(operation);
    }

    const logger = this.logger.child({
      app_id: params.appId,
      app_name: params.appName,
      operation_id: operation.id,
      trigger: params.trigger,
      operation_type: params.operationType,
    });
    logger.info("Created release build operation");

    try {
      await this.lockService.attachOperationToLock(lock.id, operation.id);
      await this.setAppBuilding(params.appId);

      if (params.onBeforeTrigger) {
        await params.onBeforeTrigger(operation);
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

      const execution = await params.executor(operation);

      details = parseOperationDetails(details, { trigger: params.trigger });
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
          await params.onAfterTrigger(updated, execution.buildNumber);
        } catch (error) {
          logger.warn("Release build post-trigger hook failed", {
            build_number: execution.buildNumber,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logger.info("Triggered release build executor", {
        build_number: execution.buildNumber,
        executor: execution.executor,
      });

      return {
        operation: updated,
        buildNumber: execution.buildNumber,
        reused: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to trigger release build";
      details = setOperationError(details, {
        code: "EXECUTOR_TRIGGER_FAILED",
        message,
        retryable: false,
      });
      details = upsertOperationStep(details, {
        key: "trigger",
        label: "Trigger executor",
        status: "failed",
        message,
      });

      await this.failOperationStart({
        operationId: operation.id,
        appId: params.appId,
        appStatus: params.appStatus,
        details,
        message,
        lockId: lock.id,
        onTriggerFailure: params.onTriggerFailure,
      });

      logger.error("Failed to trigger release build", {
        error: message,
      });

      throw new AppOperationError({
        code: "RELEASE_BUILD_TRIGGER_FAILED",
        message,
        statusCode: 500,
      });
    }
  }
}
