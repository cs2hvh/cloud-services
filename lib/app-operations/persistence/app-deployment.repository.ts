import { createServiceClient } from "@/lib/supabase/server";
import type {
  AppDeploymentRecord,
  AppDeploymentStatus,
  AppDeploymentTrigger,
  AppOperationDetails,
} from "@/lib/app-operations/core/types";

const TABLE = "platform_app_deployments";

function mapRecord(record: Record<string, unknown>): AppDeploymentRecord {
  return {
    id: String(record.id),
    app_id: String(record.app_id),
    build_number:
      typeof record.build_number === "number" && Number.isFinite(record.build_number)
        ? record.build_number
        : null,
    commit_sha: typeof record.commit_sha === "string" ? record.commit_sha : null,
    image_tag: typeof record.image_tag === "string" ? record.image_tag : null,
    image_digest: typeof record.image_digest === "string" ? record.image_digest : null,
    status: record.status as AppDeploymentStatus,
    trigger: record.trigger as AppDeploymentTrigger,
    failure_reason: typeof record.failure_reason === "string" ? record.failure_reason : null,
    rollback_target_build_number:
      typeof record.rollback_target_build_number === "number" &&
      Number.isFinite(record.rollback_target_build_number)
        ? record.rollback_target_build_number
        : null,
    idempotency_key: typeof record.idempotency_key === "string" ? record.idempotency_key : null,
    operation_details:
      record.operation_details && typeof record.operation_details === "object"
        ? (record.operation_details as AppOperationDetails)
        : null,
    created_at: String(record.created_at),
  };
}

export class AppDeploymentRepository {
  private async insert(params: {
    appId: string;
    buildNumber?: number | null;
    commitSha?: string | null;
    imageTag?: string | null;
    imageDigest?: string | null;
    status: AppDeploymentStatus;
    trigger: AppDeploymentTrigger;
    failureReason?: string | null;
    rollbackTargetBuildNumber?: number | null;
    idempotencyKey?: string | null;
    operationDetails: AppOperationDetails;
  }) {
    const supabase = await createServiceClient();
    return supabase
      .from(TABLE)
      .insert({
        app_id: params.appId,
        build_number: params.buildNumber ?? null,
        commit_sha: params.commitSha ?? null,
        image_tag: params.imageTag ?? null,
        image_digest: params.imageDigest ?? null,
        status: params.status,
        trigger: params.trigger,
        failure_reason: params.failureReason ?? null,
        rollback_target_build_number: params.rollbackTargetBuildNumber ?? null,
        idempotency_key: params.idempotencyKey ?? null,
        operation_details: params.operationDetails,
      })
      .select("*")
      .single();
  }

  async create(params: {
    appId: string;
    buildNumber?: number | null;
    commitSha?: string | null;
    imageTag?: string | null;
    imageDigest?: string | null;
    status: AppDeploymentStatus;
    trigger: AppDeploymentTrigger;
    failureReason?: string | null;
    rollbackTargetBuildNumber?: number | null;
    idempotencyKey?: string | null;
    operationDetails: AppOperationDetails;
  }): Promise<AppDeploymentRecord> {
    const { data, error } = await this.insert(params);

    if (error) {
      throw new Error(`Failed to create app deployment record: ${error.message}`);
    }

    return mapRecord(data as Record<string, unknown>);
  }

  async createIdempotent(params: {
    appId: string;
    buildNumber?: number | null;
    commitSha?: string | null;
    imageTag?: string | null;
    imageDigest?: string | null;
    status: AppDeploymentStatus;
    trigger: AppDeploymentTrigger;
    failureReason?: string | null;
    rollbackTargetBuildNumber?: number | null;
    idempotencyKey?: string | null;
    operationDetails: AppOperationDetails;
  }): Promise<{ record: AppDeploymentRecord; reused: boolean }> {
    const { data, error } = await this.insert(params);

    if (!error && data) {
      return {
        record: mapRecord(data as Record<string, unknown>),
        reused: false,
      };
    }

    if (error?.code === "23505" && params.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(params.appId, params.idempotencyKey);
      if (existing) {
        return { record: existing, reused: true };
      }
    }

    throw new Error(`Failed to create app deployment record: ${error?.message ?? "unknown error"}`);
  }

  async findById(operationId: string): Promise<AppDeploymentRecord | null> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("id", operationId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to read app deployment record: ${error.message}`);
    }

    return data ? mapRecord(data as Record<string, unknown>) : null;
  }

  async findByIdempotencyKey(
    appId: string,
    idempotencyKey: string
  ): Promise<AppDeploymentRecord | null> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("app_id", appId)
      .eq("idempotency_key", idempotencyKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to read deployment idempotency state: ${error.message}`);
    }

    return data ? mapRecord(data as Record<string, unknown>) : null;
  }

  async findLatestInProgressByApp(appId: string): Promise<AppDeploymentRecord | null> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("app_id", appId)
      .eq("status", "building")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to read in-progress app deployment record: ${error.message}`);
    }

    return data ? mapRecord(data as Record<string, unknown>) : null;
  }

  async findByBuildNumber(appId: string, buildNumber: number): Promise<AppDeploymentRecord | null> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("app_id", appId)
      .eq("build_number", buildNumber)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to read deployment by build number: ${error.message}`);
    }

    return data ? mapRecord(data as Record<string, unknown>) : null;
  }

  async updateById(params: {
    operationId: string;
    buildNumber?: number | null;
    commitSha?: string | null;
    imageTag?: string | null;
    imageDigest?: string | null;
    status?: AppDeploymentStatus;
    failureReason?: string | null;
    rollbackTargetBuildNumber?: number | null;
    operationDetails?: AppOperationDetails;
  }): Promise<AppDeploymentRecord> {
    const supabase = await createServiceClient();
    const patch: Record<string, unknown> = {};

    if (params.buildNumber !== undefined) patch.build_number = params.buildNumber;
    if (params.commitSha !== undefined) patch.commit_sha = params.commitSha;
    if (params.imageTag !== undefined) patch.image_tag = params.imageTag;
    if (params.imageDigest !== undefined) patch.image_digest = params.imageDigest;
    if (params.status !== undefined) patch.status = params.status;
    if (params.failureReason !== undefined) patch.failure_reason = params.failureReason;
    if (params.rollbackTargetBuildNumber !== undefined) {
      patch.rollback_target_build_number = params.rollbackTargetBuildNumber;
    }
    if (params.operationDetails !== undefined) patch.operation_details = params.operationDetails;

    const { data, error } = await supabase
      .from(TABLE)
      .update(patch)
      .eq("id", params.operationId)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to update app deployment record: ${error.message}`);
    }

    return mapRecord(data as Record<string, unknown>);
  }
}
