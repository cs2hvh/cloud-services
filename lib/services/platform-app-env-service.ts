import { Platform_Apps } from "@/lib/supabase/queries";
import { GENERIC_SERVICE_ERROR } from "@/lib/api/error-sanitizer";
import { PlatformAppService } from "@/lib/services/platform-app-service";

export type AppEnvVar = {
  key: string;
  value: string;
};

export type OwnedAppForEnv = {
  id: string;
  name: string;
  framework: string | null;
  status: string;
};

export type EnvServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; errorCode: "NOT_FOUND" | "FORBIDDEN" | "DB_ERROR" };

export class PlatformAppEnvService {
  static async getOwnedApp(appId: string, userId: string): Promise<EnvServiceResult<OwnedAppForEnv>> {
    try {
      const app = await PlatformAppService.getApp({
        appId,
        userId,
        syncStatus: false,
        includeEnvVars: false,
      });

      return {
        success: true,
        data: {
          id: app.id,
          name: app.name,
          framework: app.framework ?? null,
          status: app.status,
        },
      };
    } catch (error) {
      const appError = error as Error & { code?: string };
      if (appError.code === "NOT_FOUND") {
        return { success: false, error: "App not found", errorCode: "NOT_FOUND" };
      }
      if (appError.code === "FORBIDDEN") {
        return { success: false, error: "Access denied", errorCode: "FORBIDDEN" };
      }
      return {
        success: false,
        error: GENERIC_SERVICE_ERROR,
        errorCode: "DB_ERROR",
      };
    }
  }

  static async getEnvVars(appId: string): Promise<AppEnvVar[]> {
    try {
      const envVars = await Platform_Apps.get_env_vars(appId);
      return envVars.map((env: { key: string; value: string }) => ({
        key: env.key,
        value: env.value,
      }));
    } catch (error) {
      console.error(`[PlatformAppEnvService.getEnvVars] Failed to fetch env vars for app ${appId}:`, error);
      throw error;
    }
  }

  static async setEnvVars(appId: string, envVars: AppEnvVar[]): Promise<EnvServiceResult<null>> {
    const setResult = await Platform_Apps.set_env_vars(appId, envVars);
    if (!setResult.success) {
      return {
        success: false,
        error: setResult.error || "Failed to update environment variables",
        errorCode: "DB_ERROR",
      };
    }

    return { success: true, data: null };
  }

  /**
   * Add or update a single env var without replacing the entire array.
   * If the key exists, its value is updated. Otherwise it's appended.
   */
  static async upsertEnvVar(
    appId: string,
    key: string,
    value: string
  ): Promise<EnvServiceResult<AppEnvVar[]>> {
    try {
      const existing = await this.getEnvVars(appId);
      const idx = existing.findIndex((e) => e.key === key);
      if (idx >= 0) {
        existing[idx].value = value;
      } else {
        existing.push({ key, value });
      }
      const saveResult = await this.setEnvVars(appId, existing);
      if (!saveResult.success) {
        return saveResult as EnvServiceResult<AppEnvVar[]>;
      }
      return { success: true, data: existing };
    } catch (error) {
      console.error("[PlatformApp:env] failed:", error);
      return {
        success: false,
        error: GENERIC_SERVICE_ERROR,
        errorCode: "DB_ERROR",
      };
    }
  }

  /**
   * Remove a single env var by key. No-op if the key doesn't exist.
   */
  static async removeEnvVar(
    appId: string,
    key: string
  ): Promise<EnvServiceResult<{ removed: boolean; remaining: AppEnvVar[] }>> {
    try {
      const existing = await this.getEnvVars(appId);
      const filtered = existing.filter((e) => e.key !== key);
      const removed = filtered.length < existing.length;

      if (removed) {
        const saveResult = await this.setEnvVars(appId, filtered);
        if (!saveResult.success) {
          return saveResult as EnvServiceResult<{ removed: boolean; remaining: AppEnvVar[] }>;
        }
      }

      return { success: true, data: { removed, remaining: filtered } };
    } catch (error) {
      console.error("[PlatformApp:env] failed:", error);
      return {
        success: false,
        error: GENERIC_SERVICE_ERROR,
        errorCode: "DB_ERROR",
      };
    }
  }

  /**
   * Bulk add/update multiple env vars without replacing unrelated vars.
   * Existing vars with matching keys are updated; new keys are appended.
   */
  static async bulkUpsertEnvVars(
    appId: string,
    vars: AppEnvVar[]
  ): Promise<EnvServiceResult<AppEnvVar[]>> {
    try {
      const existing = await this.getEnvVars(appId);
      const existingMap = new Map(existing.map((e) => [e.key, e]));

      for (const v of vars) {
        existingMap.set(v.key, v);
      }

      const merged = Array.from(existingMap.values());
      const saveResult = await this.setEnvVars(appId, merged);
      if (!saveResult.success) {
        return saveResult as EnvServiceResult<AppEnvVar[]>;
      }
      return { success: true, data: merged };
    } catch (error) {
      console.error("[PlatformApp:env] failed:", error);
      return {
        success: false,
        error: GENERIC_SERVICE_ERROR,
        errorCode: "DB_ERROR",
      };
    }
  }
}
