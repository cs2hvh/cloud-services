import { Platform_Apps } from "@/lib/supabase/queries";
import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";
import type { AppReadPort } from "@/lib/domain-service/core/ports";
import type { AppRecord } from "@/lib/domain-service/core/types";

export class SupabaseAppReadAdapter implements AppReadPort {
  async getOwnedApp(appId: string, userId: string): Promise<AppRecord> {
    const result = await Platform_Apps.get(appId);
    if (!result.success || !result.data) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.APP_NOT_FOUND,
        message: "App not found",
      });
    }

    if (result.data.user_id !== userId) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.FORBIDDEN,
        message: "You do not have permission to access this app",
      });
    }

    return {
      id: result.data.id,
      user_id: result.data.user_id,
      name: result.data.name,
      slug: result.data.slug,
      status: result.data.status,
      project_id: result.data.project_id || null,
    };
  }
}
