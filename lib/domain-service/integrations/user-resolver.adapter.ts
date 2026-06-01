import { createServiceClient } from "@/lib/supabase/server";
import type { DomainUserResolverPort } from "@/lib/domain-service/core/ports";

export function createDomainUserResolverAdapter(): DomainUserResolverPort {
  return {
    async getUserEmail(userId: string): Promise<string | null> {
      try {
        const supabase = await createServiceClient();
        const { data, error } = await supabase.auth.admin.getUserById(userId);
        if (error || !data?.user?.email) return null;
        return data.user.email;
      } catch {
        return null;
      }
    },
  };
}
