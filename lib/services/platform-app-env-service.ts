import { Platform_Apps } from "@/lib/supabase/queries";
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
        error: appError.message || "Failed to fetch app",
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
}
