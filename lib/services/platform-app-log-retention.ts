import { createServiceClient } from "@/lib/supabase/server";
import {
  getBuildLogRetentionUntil,
  type PlatformAppBuildStatus,
} from "@/lib/platform-apps/retention";
import { JenkinsService } from "@/lib/services/jenkins";

export interface ArchiveBuildLogOptions {
  appId: string;
  deploymentId?: string | null;
  appName: string;
  buildNumber: number;
  status: PlatformAppBuildStatus;
  production?: boolean;
}

export interface ArchiveBuildLogResult {
  archived: boolean;
  skipped: boolean;
  reason?: string;
  storageKey?: string;
  sizeBytes?: number;
  retentionUntil?: string | null;
}

export interface CleanupExpiredBuildLogsOptions {
  limit?: number;
  dryRun?: boolean;
}

export interface CleanupExpiredBuildLogsResult {
  scanned: number;
  markedDeleted: number;
  failed: number;
  dryRun: boolean;
}

export interface DeleteBuildLogsForAppResult {
  scanned: number;
  deletedObjects: number;
}

const BUCKET = "build-logs";
const MAX_LOG_BYTES = 10 * 1024 * 1024;
const TRUNCATION_NOTICE = "\n\n[AhuraCloud] Log archive truncated by retention safety limit.\n";
const MAX_CLEANUP_LIMIT = 500;
const DEFAULT_CLEANUP_LIMIT = 100;

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, "[REDACTED_GITHUB_TOKEN]"],
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED_GITLAB_TOKEN]"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]"],
  [/((?:password|passwd|token|secret|api[_-]?key|access[_-]?key)\s*[=:]\s*)[^\s"'&]+/gi, "$1[REDACTED]"],
];

function redact(text: string): string {
  return SECRET_PATTERNS.reduce(
    (s, [pattern, replacement]) => s.replace(pattern, replacement),
    text
  );
}

function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_CLEANUP_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_CLEANUP_LIMIT);
}

function toStorageBody(text: string): Buffer {
  const body = Buffer.from(text, "utf8");
  if (body.length <= MAX_LOG_BYTES) return body;

  // Keep the tail — deployment steps are at the end, not the start
  const notice = Buffer.from(TRUNCATION_NOTICE, "utf8");
  const tailStart = body.length - MAX_LOG_BYTES + notice.length;
  return Buffer.concat([notice, body.subarray(tailStart)]);
}

export class PlatformAppLogRetentionService {
  /**
   * Fetch the filtered deployment log from Jenkins, redact secrets, and
   * store in Supabase Storage.  Fire-and-forget — callers should not await.
   */
  static async archiveBuildLog(
    options: ArchiveBuildLogOptions
  ): Promise<ArchiveBuildLogResult> {
    const logText = await JenkinsService.getDeploymentLog(
      options.appName,
      options.buildNumber
    );

    if (!logText || logText === "Build in progress...") {
      return { archived: false, skipped: true, reason: "no log content" };
    }

    const safeLog = redact(logText);
    const body = toStorageBody(safeLog);
    const sizeBytes = body.length;
    const storagePath = `${options.appId}/${options.buildNumber}.log`;
    const retentionUntil = getBuildLogRetentionUntil({
      status: options.status,
      production: options.production,
    });

    const supabase = await createServiceClient();

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, body, { upsert: true, contentType: "text/plain" });

    if (uploadError) throw new Error(uploadError.message);

    const metadata: Record<string, unknown> = {
      app_id: options.appId,
      build_number: options.buildNumber,
      storage_path: storagePath,
      size_bytes: sizeBytes,
      status: "available",
      retention_until: retentionUntil,
      deleted_at: null,
      last_cleanup_error: null,
    };

    if (options.deploymentId !== undefined) {
      metadata.deployment_id = options.deploymentId;
    }

    const { error: dbError } = await supabase
      .from("platform_app_build_logs")
      .upsert(metadata, { onConflict: "app_id,build_number" });

    if (dbError) throw new Error(dbError.message);

    return {
      archived: true,
      skipped: false,
      storageKey: storagePath,
      sizeBytes,
      retentionUntil,
    };
  }

  /**
   * Retrieve a cached filtered log from Supabase Storage.
   * Returns null if not archived, expired/deleted, or on any error.
   */
  static async retrieve(
    appId: string,
    buildNumber: number
  ): Promise<string | null> {
    try {
      const supabase = await createServiceClient();

      const { data: log, error: logError } = await supabase
        .from("platform_app_build_logs")
        .select("storage_path")
        .eq("app_id", appId)
        .eq("build_number", buildNumber)
        .eq("status", "available")
        .is("deleted_at", null)
        .maybeSingle();

      if (logError) throw new Error(logError.message);

      if (!log?.storage_path) return null;

      const { data: blob, error } = await supabase.storage
        .from(BUCKET)
        .download(log.storage_path);

      if (error || !blob) return null;
      return blob.text();
    } catch (err) {
      console.error("[PlatformAppLogRetention] retrieve failed:", err);
      return null;
    }
  }

  /**
   * Delete expired log objects from Supabase Storage and mark DB records deleted.
   */
  static async cleanupExpiredBuildLogs(
    options: CleanupExpiredBuildLogsOptions = {}
  ): Promise<CleanupExpiredBuildLogsResult> {
    const limit = clampLimit(options.limit);
    const dryRun = options.dryRun === true;
    const now = new Date().toISOString();
    const supabase = await createServiceClient();

    const { data: rows, error } = await supabase
      .from("platform_app_build_logs")
      .select("id, storage_path")
      .eq("pinned", false)
      .is("deleted_at", null)
      .not("retention_until", "is", null)
      .lte("retention_until", now)
      .in("status", ["available", "delete_failed"])
      .order("retention_until", { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);

    const expired = rows ?? [];
    if (dryRun || expired.length === 0) {
      return { scanned: expired.length, markedDeleted: 0, failed: 0, dryRun };
    }

    let markedDeleted = 0;
    let failed = 0;

    for (const row of expired) {
      try {
        if (row.storage_path) {
          const { error: removeError } = await supabase.storage
            .from(BUCKET)
            .remove([row.storage_path]);

          if (removeError) throw new Error(removeError.message);
        }

        const { error: updateError } = await supabase
          .from("platform_app_build_logs")
          .update({ status: "deleted", deleted_at: now, last_cleanup_error: null })
          .eq("id", row.id);

        if (updateError) throw new Error(updateError.message);

        markedDeleted++;
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        const { error: markFailedError } = await supabase
          .from("platform_app_build_logs")
          .update({ status: "delete_failed", last_cleanup_error: message })
          .eq("id", row.id);

        if (markFailedError) {
          console.error("[PlatformAppLogRetention] Failed to mark cleanup failure:", markFailedError.message);
        }
      }
    }

    return { scanned: expired.length, markedDeleted, failed, dryRun };
  }

  /**
   * Delete all archived log objects for an app before the app row is deleted.
   * DB metadata will be removed by the platform_apps ON DELETE CASCADE.
   */
  static async deleteBuildLogsForApp(
    appId: string
  ): Promise<DeleteBuildLogsForAppResult> {
    const supabase = await createServiceClient();
    const { data: rows, error } = await supabase
      .from("platform_app_build_logs")
      .select("storage_path")
      .eq("app_id", appId)
      .not("storage_path", "is", null);

    if (error) throw new Error(error.message);

    const paths = (rows ?? [])
      .map((row) => row.storage_path)
      .filter((path): path is string => typeof path === "string" && path.length > 0);

    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error: removeError } = await supabase.storage
        .from(BUCKET)
        .remove(chunk);

      if (removeError) throw new Error(removeError.message);
    }

    return { scanned: rows?.length ?? 0, deletedObjects: paths.length };
  }
}
