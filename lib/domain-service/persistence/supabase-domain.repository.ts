import { createServiceClient } from "@/lib/supabase/server";
import { DOMAIN_ERROR_CODES, DomainServiceError } from "@/lib/domain-service/core/errors";
import type { DomainRecord } from "@/lib/domain-service/core/types";
import type { DomainRepositoryPort } from "@/lib/domain-service/core/ports";

export class SupabaseDomainRepository implements DomainRepositoryPort {
  async listByApp(appId: string, userId: string): Promise<DomainRecord[]> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("platform_app_domains")
      .select("*")
      .eq("app_id", appId)
      .eq("user_id", userId)
      .neq("status", "removed")
      .order("created_at", { ascending: false });

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to list domains: ${error.message}`,
      });
    }

    return (data || []) as DomainRecord[];
  }

  async findByIdForUser(domainId: string, userId: string): Promise<DomainRecord | null> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("platform_app_domains")
      .select("*")
      .eq("id", domainId)
      .eq("user_id", userId)
      .neq("status", "removed")
      .maybeSingle();

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to read domain: ${error.message}`,
      });
    }

    return (data || null) as DomainRecord | null;
  }

  async findActiveByDomain(domain: string): Promise<DomainRecord | null> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("platform_app_domains")
      .select("*")
      .eq("domain", domain)
      .neq("status", "removed")
      .maybeSingle();

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to check domain uniqueness: ${error.message}`,
      });
    }

    return (data || null) as DomainRecord | null;
  }

  async createPending(params: {
    appId: string;
    userId: string;
    domain: string;
    verificationToken: string;
  }): Promise<DomainRecord> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("platform_app_domains")
      .insert({
        app_id: params.appId,
        user_id: params.userId,
        domain: params.domain,
        status: "pending",
        verification_token: params.verificationToken,
        verification_method: "txt",
        ssl_status: "pending",
        is_primary: false,
        redirect_to_primary: false,
      })
      .select("*")
      .single();

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to create domain: ${error.message}`,
      });
    }

    return data as DomainRecord;
  }

  async markVerified(domainId: string): Promise<DomainRecord> {
    return this.updateAndReturn(domainId, {
      status: "verified",
      verified_at: new Date().toISOString(),
      last_error: null,
      last_check_at: new Date().toISOString(),
    });
  }

  async markActive(domainId: string): Promise<DomainRecord> {
    return this.updateAndReturn(domainId, {
      status: "active",
      activated_at: new Date().toISOString(),
      ssl_status: "issuing",
      last_error: null,
      last_check_at: new Date().toISOString(),
    });
  }

  async markRemoved(domainId: string): Promise<void> {
    await this.updateAndReturn(domainId, {
      status: "removed",
      last_check_at: new Date().toISOString(),
    });
  }

  async setPrimary(
    domainId: string,
    appId: string,
    options?: { redirectToPrimary?: boolean }
  ): Promise<DomainRecord> {
    const supabase = await createServiceClient();

    const clearResult = await supabase
      .from("platform_app_domains")
      .update({ is_primary: false })
      .eq("app_id", appId)
      .neq("status", "removed");

    if (clearResult.error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to clear existing primary domain: ${clearResult.error.message}`,
      });
    }

    const patch: Record<string, unknown> = {
      is_primary: true,
      last_check_at: new Date().toISOString(),
    };

    if (options?.redirectToPrimary !== undefined) {
      patch.redirect_to_primary = options.redirectToPrimary;
    }

    return this.updateAndReturn(domainId, patch);
  }

  async updateLastError(domainId: string, message: string | null): Promise<void> {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .from("platform_app_domains")
      .update({
        last_error: message,
        last_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", domainId);

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to update domain error state: ${error.message}`,
      });
    }
  }

  async updateSslStatus(
    domainId: string,
    status: "pending" | "issuing" | "active" | "failed"
  ): Promise<void> {
    const supabase = await createServiceClient();
    const { error } = await supabase
      .from("platform_app_domains")
      .update({
        ssl_status: status,
        last_check_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", domainId);

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to update ssl_status: ${error.message}`,
      });
    }
  }

  private async updateAndReturn(domainId: string, patch: Record<string, unknown>): Promise<DomainRecord> {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("platform_app_domains")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", domainId)
      .select("*")
      .single();

    if (error) {
      throw new DomainServiceError({
        code: DOMAIN_ERROR_CODES.INTERNAL_ERROR,
        message: `Failed to update domain: ${error.message}`,
      });
    }

    return data as DomainRecord;
  }
}
