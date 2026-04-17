import { Platform_Apps, Platform_App_Deployments } from "@/lib/supabase/queries";
import { AppOperationLogger } from "@/lib/app-operations/application/app-operation-logger";
import { ResourceMutationLockService } from "@/lib/app-operations/application/resource-mutation-lock.service";
import {
  appendOperationWarning,
  createOperationDetails,
  parseOperationDetails,
  setOperationError,
  setOperationVerification,
  upsertOperationStep,
} from "@/lib/app-operations/core/operation-details";
import type {
  AppDeploymentTrigger,
  AppOperationDetails,
} from "@/lib/app-operations/core/types";
import { AppDeploymentRepository } from "@/lib/app-operations/persistence/app-deployment.repository";
import { KubernetesRolloutAdapter } from "@/lib/app-operations/integrations/kubernetes-rollout.adapter";
import { AppBuildSideEffectsService } from "@/lib/app-operations/application/app-build-side-effects.service";

export class AppOperationFinalizer {
  constructor(
    private readonly deployments = new AppDeploymentRepository(),
    private readonly kubernetes = new KubernetesRolloutAdapter(),
    private readonly locks = new ResourceMutationLockService(),
    private readonly sideEffects = new AppBuildSideEffectsService(),
    private readonly logger = new AppOperationLogger({})
  ) {}

  private async buildVerification(
    appName: string
  ): Promise<NonNullable<AppOperationDetails["verification"]>> {
    try {
      const result = await this.kubernetes.verifyAppRollout(appName);
      return {
        status: result.degraded ? "degraded" : "healthy",
        desired_replicas: result.desiredReplicas,
        ready_replicas: result.readyReplicas,
        observed_image: result.observedImage,
        message: result.message,
        checked_at: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: "degraded",
        message:
          error instanceof Error
            ? `Verification failed: ${error.message}`
            : "Verification failed",
        checked_at: new Date().toISOString(),
      };
    }
  }

  private async updateAppState(appId: string, patch: Record<string, unknown>) {
    const result = await Platform_Apps.update(appId, patch);
    if (!result.success) {
      throw new Error(result.error || "Failed to update app state");
    }
  }

  async finalizeRuntimeOperation(params: {
    operationId: string;
    appId: string;
    appName: string;
    trigger: AppDeploymentTrigger;
    commitSha?: string | null;
    activeDeploymentId?: string | null;
    failureReason?: string | null;
    status: "success" | "failed";
  }) {
    try {
      const record = await this.deployments.findById(params.operationId);
      if (!record) {
        throw new Error(`Operation ${params.operationId} not found`);
      }

      let details = parseOperationDetails(record.operation_details, {
        trigger: record.trigger,
      });

      if (params.status === "success") {
        details = upsertOperationStep(details, {
          key: "apply",
          label: "Apply change",
          status: "success",
        });
        details = setOperationVerification(details, await this.buildVerification(params.appName));
        if (details.verification?.status === "degraded" && details.verification.message) {
          details = appendOperationWarning(details, details.verification.message);
        }
      } else {
        details = upsertOperationStep(details, {
          key: "apply",
          label: "Apply change",
          status: "failed",
          message: params.failureReason ?? "Operation failed",
        });
        details = setOperationVerification(details, {
          status: "failed",
          message: params.failureReason ?? "Operation failed before verification",
        });
        details = setOperationError(details, {
          code: "RUNTIME_OPERATION_FAILED",
          message: params.failureReason ?? "Operation failed",
          retryable: false,
        });
      }

      const updated = await this.deployments.updateById({
        operationId: params.operationId,
        status: params.status,
        failureReason: params.status === "success" ? null : (params.failureReason ?? null),
        operationDetails: details,
      });

      if (params.status === "success") {
        if (params.activeDeploymentId) {
          const activeResult = await Platform_App_Deployments.set_active_for_app(
            params.appId,
            params.activeDeploymentId
          );
          if (!activeResult.success) {
            throw new Error(activeResult.error || "Failed to update active deployment");
          }
        }
        await this.updateAppState(params.appId, {
          status: "running",
          last_deploy_trigger: params.trigger,
          last_deploy_commit: params.commitSha ?? null,
          last_failure_reason: null,
        });
      } else {
        await this.updateAppState(params.appId, {
          status: "failed",
          last_deploy_trigger: params.trigger,
          last_deploy_commit: params.commitSha ?? null,
          last_failure_reason: params.failureReason ?? "Operation failed",
        });
      }

      this.logger.child({
        app_id: params.appId,
        app_name: params.appName,
        operation_id: params.operationId,
        trigger: params.trigger,
        status: params.status,
      }).info("Finalized runtime operation", {
        verification: details.verification,
      });

      return updated;
    } finally {
      try {
        await this.locks.releaseAppMutationLockForOperation(params.operationId);
      } catch (error) {
        this.logger.child({
          app_id: params.appId,
          app_name: params.appName,
          operation_id: params.operationId,
        }).warn("Failed to release mutation lock for runtime operation", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async finalizeBuildOperation(params: {
    appId: string;
    appName: string;
    buildNumber?: number;
    operationId?: string; // For resize: the DB record ID; bypasses complete_build lookup
    trigger: AppDeploymentTrigger;
    status: "success" | "failed";
    failureReason?: string | null;
    imageTag?: string | null;
    imageDigest?: string | null;
    commitSha?: string | null;
    allowedCurrentStatuses?: Array<"building" | "success" | "failed">;
    allowLegacyCreate?: boolean;
  }) {
    // Resize records are identified by operationId, not build_number
    if (params.trigger === "resize" && params.operationId) {
      return this.finalizeResizeOperation(params as typeof params & { operationId: string });
    }

    if (!params.buildNumber) {
      throw new Error("buildNumber is required for non-resize finalization");
    }

    let operationId: string | null = null;

    try {
      const existing = await this.deployments.findByBuildNumber(params.appId, params.buildNumber);

      const finalized = await Platform_App_Deployments.complete_build({
        app_id: params.appId,
        build_number: params.buildNumber,
        status: params.status,
        image_tag: params.imageTag,
        image_digest: params.imageDigest,
        failure_reason: params.status === "failed" ? (params.failureReason ?? null) : null,
        allowed_current_statuses: params.allowedCurrentStatuses ?? ["building"],
        create_if_missing: params.allowLegacyCreate ?? false,
        trigger: params.trigger,
        commit_sha: params.commitSha ?? null,
      });

      if (!finalized.success || !finalized.data) {
        throw new Error(finalized.error || "Failed to finalize app deployment record");
      }

      operationId =
        typeof finalized.data.id === "string"
          ? finalized.data.id
          : existing?.id ?? null;
      if (!operationId) {
        throw new Error("Finalized deployment record missing id");
      }

      if (!finalized.updated && !finalized.created) {
        const record = existing ?? (await this.deployments.findById(operationId));
        if (!record) {
          throw new Error("Finalized deployment record missing after duplicate finalization");
        }

        this.logger.child({
          app_id: params.appId,
          app_name: params.appName,
          build_number: params.buildNumber,
          operation_id: operationId,
          trigger: params.trigger,
          status: params.status,
        }).info("Build-backed operation already finalized; skipping duplicate finalization");

        return {
          record,
          legacyCreated: false,
        };
      }

      const record = await this.deployments.findById(operationId);
      let details = parseOperationDetails(
        record?.operation_details ??
          existing?.operation_details ??
          createOperationDetails({ trigger: params.trigger }),
        { trigger: params.trigger }
      );

      details = upsertOperationStep(details, {
        key: "finalize",
        label: "Finalize deployment",
        status: params.status === "success" ? "success" : "failed",
        message: params.status === "failed" ? (params.failureReason ?? "Deployment failed") : undefined,
      });

      if (params.status === "success") {
        details = setOperationVerification(details, await this.buildVerification(params.appName));
        if (details.verification?.status === "degraded" && details.verification.message) {
          details = appendOperationWarning(details, details.verification.message);
        }
      } else {
        details = setOperationVerification(details, {
          status: "failed",
          message: params.failureReason ?? "Deployment failed before verification",
        });
        details = setOperationError(details, {
          code: "BUILD_FAILED",
          message: params.failureReason ?? "Deployment failed",
          retryable: false,
        });
      }

      const updated = await this.deployments.updateById({
        operationId,
        imageTag: params.imageTag,
        imageDigest: params.imageDigest,
        commitSha: params.commitSha,
        status: params.status,
        failureReason: params.status === "success" ? null : (params.failureReason ?? null),
        operationDetails: details,
      });

      const sideEffectWarnings = await this.sideEffects.applyBuildFinalizationSideEffects({
        appId: params.appId,
        appName: params.appName,
        record: updated,
        details,
        trigger: params.trigger,
        status: params.status,
      });

      let finalRecord = updated;
      let finalDetails = details;
      if (sideEffectWarnings.length > 0) {
        for (const warning of sideEffectWarnings) {
          finalDetails = appendOperationWarning(finalDetails, warning);
        }
        finalRecord = await this.deployments.updateById({
          operationId,
          operationDetails: finalDetails,
        });
      }

      if (params.status === "success") {
        if (params.trigger !== "resize" && params.trigger !== "rollback") {
          const activeResult = await Platform_App_Deployments.set_active_for_app(
            params.appId,
            operationId
          );
          if (!activeResult.success) {
            throw new Error(activeResult.error || "Failed to update active deployment");
          }
        }
        await this.updateAppState(params.appId, {
          status: "running",
          last_deploy_trigger: params.trigger,
          last_deploy_commit: params.commitSha ?? null,
          last_failure_reason: null,
        });
      } else {
        await this.updateAppState(params.appId, {
          status: "failed",
          last_deploy_trigger: params.trigger,
          last_deploy_commit: params.commitSha ?? null,
          last_failure_reason: params.failureReason ?? null,
        });
      }

      this.logger.child({
        app_id: params.appId,
        app_name: params.appName,
        build_number: params.buildNumber,
        operation_id: operationId,
        trigger: params.trigger,
        status: params.status,
      }).info("Finalized build-backed operation", {
        verification: finalDetails.verification,
        legacy_fallback: finalized.created === true,
        side_effect_warnings: sideEffectWarnings,
      });

      return {
        record: finalRecord,
        legacyCreated: finalized.created === true,
      };
    } finally {
      if (operationId) {
        try {
          await this.locks.releaseAppMutationLockForOperation(operationId);
        } catch (error) {
          this.logger.child({
            app_id: params.appId,
            app_name: params.appName,
            operation_id: operationId,
            build_number: params.buildNumber,
          }).warn("Failed to release mutation lock for build-backed operation", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /**
   * Finalize a resize operation by its operationId (DB record UUID).
   * Resize records have build_number = NULL and are never looked up by build_number.
   */
  private async finalizeResizeOperation(params: {
    appId: string;
    appName: string;
    operationId: string;
    trigger: AppDeploymentTrigger;
    status: "success" | "failed";
    failureReason?: string | null;
    imageTag?: string | null;
    imageDigest?: string | null;
    commitSha?: string | null;
  }) {
    const { operationId } = params;
    try {
      const existing = await this.deployments.findById(operationId);
      if (!existing) {
        throw new Error(`Resize operation record not found: ${operationId}`);
      }

      let details = parseOperationDetails(
        existing.operation_details ?? createOperationDetails({ trigger: params.trigger }),
        { trigger: params.trigger }
      );

      details = upsertOperationStep(details, {
        key: "finalize",
        label: "Finalize resize",
        status: params.status === "success" ? "success" : "failed",
        message: params.status === "failed" ? (params.failureReason ?? "Resize failed") : undefined,
      });

      if (params.status === "success") {
        details = setOperationVerification(details, await this.buildVerification(params.appName));
        if (details.verification?.status === "degraded" && details.verification.message) {
          details = appendOperationWarning(details, details.verification.message);
        }
      } else {
        details = setOperationVerification(details, {
          status: "failed",
          message: params.failureReason ?? "Resize failed before verification",
        });
        details = setOperationError(details, {
          code: "RESIZE_FAILED",
          message: params.failureReason ?? "Resize failed",
          retryable: false,
        });
      }

      const updated = await this.deployments.updateById({
        operationId,
        status: params.status,
        failureReason: params.status === "success" ? null : (params.failureReason ?? null),
        operationDetails: details,
      });

      const sideEffectWarnings = await this.sideEffects.applyBuildFinalizationSideEffects({
        appId: params.appId,
        appName: params.appName,
        record: updated,
        details,
        trigger: params.trigger,
        status: params.status,
      });

      let finalRecord = updated;
      let finalDetails = details;
      if (sideEffectWarnings.length > 0) {
        for (const warning of sideEffectWarnings) {
          finalDetails = appendOperationWarning(finalDetails, warning);
        }
        finalRecord = await this.deployments.updateById({
          operationId,
          operationDetails: finalDetails,
        });
      }

      if (params.status === "success") {
        await this.updateAppState(params.appId, {
          status: "running",
          last_deploy_trigger: params.trigger,
          last_deploy_commit: params.commitSha ?? null,
          last_failure_reason: null,
        });
      } else {
        await this.updateAppState(params.appId, {
          status: "failed",
          last_deploy_trigger: params.trigger,
          last_deploy_commit: params.commitSha ?? null,
          last_failure_reason: params.failureReason ?? null,
        });
      }

      this.logger.child({
        app_id: params.appId,
        app_name: params.appName,
        operation_id: operationId,
        trigger: params.trigger,
        status: params.status,
      }).info("Finalized resize operation by operationId");

      return { record: finalRecord, legacyCreated: false };
    } finally {
      try {
        await this.locks.releaseAppMutationLockForOperation(operationId);
      } catch (error) {
        this.logger.child({
          app_id: params.appId,
          app_name: params.appName,
          operation_id: operationId,
        }).warn("Failed to release mutation lock for resize operation", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
