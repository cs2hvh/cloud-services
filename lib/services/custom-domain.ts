/**
 * Custom Domain Service - Handles domain verification, activation, and management
 * 
 * Flow:
 * 1. Add Domain (PENDING) - User adds domain, gets verification token
 * 2. Verify Domain (VERIFIED) - User adds TXT record, we verify it
 * 3. Activate Domain (ACTIVE) - Add to Ingress, issue SSL cert
 * 4. Remove Domain (REMOVED) - Remove from Ingress, cleanup
 */
import { createServiceClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";
import { Resolver } from "dns";

// Use public DNS servers to avoid local resolver/firewall issues
const customResolver = new Resolver();
customResolver.setServers(["8.8.8.8", "1.1.1.1"]);

// Domain status types
export type DomainStatus = 'pending' | 'verified' | 'active' | 'failed' | 'removed';
export type SSLStatus = 'pending' | 'issuing' | 'active' | 'failed';

export interface DomainRoutingStatus {
  ready: boolean;
  resolved_ips: string[];
  expected_ips: string[];
  message: string;
}

export interface CustomDomain {
  id: string;
  app_id: string;
  user_id: string;
  domain: string;
  status: DomainStatus;
  verification_token: string;
  verification_method: 'txt' | 'cname';
  verified_at: string | null;
  activated_at: string | null;
  ssl_status: SSLStatus;
  is_primary: boolean;
  redirect_to_primary: boolean;
  last_error: string | null;
  last_check_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CustomDomainWithStatus = CustomDomain & {
  dns_ready: boolean;
  dns_message: string;
  dns_resolved_ips: string[];
  dns_expected_ips: string[];
};

export interface DomainVerificationResult {
  verified: boolean;
  error?: string;
  records_found?: string[];
}

export interface AddDomainResult {
  success: boolean;
  domain?: CustomDomainWithStatus;
  error?: string;
  verification_instructions?: {
    record_type: string;
    record_name: string;
    record_value: string;
    ttl: number;
  };
}

export class CustomDomainService {
  /**
   * Generate a unique verification token
   */
  private static generateVerificationToken(): string {
    return `verify_${randomBytes(16).toString('hex')}`;
  }

  /**
   * Validate domain format
   */
  static validateDomainFormat(domain: string): { valid: boolean; error?: string } {
    // Remove protocol if present
    let cleanDomain = domain.toLowerCase().trim();
    cleanDomain = cleanDomain.replace(/^https?:\/\//, '');
    cleanDomain = cleanDomain.replace(/\/.*$/, ''); // Remove path

    // Basic domain validation regex
    const domainRegex = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

    if (!domainRegex.test(cleanDomain)) {
      return { valid: false, error: 'Invalid domain format. Example: example.com or sub.example.com' };
    }

    // Allow all domains, including platform domains
    return { valid: true };
  }

  /**
   * Clean domain string (remove protocol, path, etc.)
   */
  static cleanDomain(domain: string): string {
    let cleanDomain = domain.toLowerCase().trim();
    cleanDomain = cleanDomain.replace(/^https?:\/\//, '');
    cleanDomain = cleanDomain.replace(/\/.*$/, '');
    return cleanDomain;
  }

  /**
   * Add a custom domain to an app (Step 1: PENDING)
   */
  static async addDomain(
    appId: string,
    userId: string,
    domain: string
  ): Promise<AddDomainResult> {
    const supabase = await createServiceClient();
    
    // Clean and validate domain
    const cleanDomain = this.cleanDomain(domain);
    const validation = this.validateDomainFormat(cleanDomain);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Check if domain is already in use by any app
    const { data: existingDomain, error: checkError } = await supabase
      .from('platform_app_domains')
      .select('id, app_id, status')
      .eq('domain', cleanDomain)
      .neq('status', 'removed')
      .maybeSingle();

    if (checkError) {
      console.error('[CustomDomainService] Error checking existing domain:', checkError);
      return { success: false, error: 'Failed to check domain availability' };
    }

    if (existingDomain) {
      if (existingDomain.app_id === appId) {
        return { success: false, error: 'This domain is already added to this app' };
      }
      return { success: false, error: 'This domain is already in use by another app' };
    }

    // Generate verification token
    const verificationToken = this.generateVerificationToken();

    // Create domain record
    const { data: newDomain, error: createError } = await supabase
      .from('platform_app_domains')
      .insert({
        app_id: appId,
        user_id: userId,
        domain: cleanDomain,
        status: 'pending',
        verification_token: verificationToken,
        verification_method: 'txt',
        ssl_status: 'pending',
        is_primary: false,
        redirect_to_primary: false,
      })
      .select()
      .single();

    if (createError) {
      console.error('[CustomDomainService] Error creating domain:', createError);
      return { success: false, error: createError.message };
    }

    console.log(`[CustomDomainService] ✅ Added domain ${cleanDomain} for app ${appId}`);

    const domainWithStatus = await this.decorateDomainWithRouting(newDomain as CustomDomain);

    return {
      success: true,
      domain: domainWithStatus,
      verification_instructions: {
        record_type: 'TXT',
        record_name: `galaxyhvh-verify.${cleanDomain}`,
        record_value: verificationToken,
        ttl: 300, // 5 minutes recommended
      },
    };
  }

  /**
   * Verify domain ownership via TXT record (Step 2: VERIFIED)
   * In development mode (SKIP_DOMAIN_VERIFICATION=true), skips DNS check
   */
  static async verifyDomain(domainId: string, userId: string): Promise<DomainVerificationResult> {
    const supabase = await createServiceClient();

    // Get domain record
    const { data: domainRecord, error: fetchError } = await supabase
      .from('platform_app_domains')
      .select('*')
      .eq('id', domainId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !domainRecord) {
      return { verified: false, error: 'Domain not found or access denied' };
    }

    if (domainRecord.status === 'active') {
      return { verified: true, records_found: ['Already active'] };
    }

    if (domainRecord.status === 'removed') {
      return { verified: false, error: 'Domain has been removed' };
    }

    // Perform DNS TXT lookup using public DNS
    const txtRecordName = `galaxyhvh-verify.${domainRecord.domain}`;
    let txtRecords: string[] = [];

    try {
      const records: string[][] = await new Promise((resolve, reject) => {
        customResolver.resolveTxt(txtRecordName, (err, addresses) => {
          if (err) return reject(err);
          resolve(addresses);
        });
      });
      txtRecords = records.flat(); // Flatten nested arrays
      console.log(`[CustomDomainService] Found TXT records for ${txtRecordName}:`, txtRecords);
    } catch (dnsError: unknown) {
      const errorCode = (dnsError as { code?: string }).code;
      if (errorCode === 'ENODATA' || errorCode === 'ENOTFOUND') {
        // No TXT records found - expected when user hasn't added yet
        await this.updateDomainStatus(domainId, {
          last_check_at: new Date().toISOString(),
          last_error: 'No TXT record found. Please add the DNS record and try again.',
        });
        return { 
          verified: false, 
          error: `No TXT record found at ${txtRecordName}. Please add the DNS record and wait a few minutes for propagation.`,
          records_found: [] 
        };
      }
      
      console.error('[CustomDomainService] DNS lookup error:', dnsError);
      await this.updateDomainStatus(domainId, {
        last_check_at: new Date().toISOString(),
        last_error: `DNS lookup failed: ${errorCode || 'Unknown error'}`,
      });
      return { verified: false, error: `DNS lookup failed: ${errorCode || 'Unknown error'}` };
    }

    // Check if verification token exists in any TXT record
    const tokenFound = txtRecords.some(record => 
      record.includes(domainRecord.verification_token)
    );

    if (tokenFound) {
      // Mark as verified
      await supabase
        .from('platform_app_domains')
        .update({
          status: 'verified',
          verified_at: new Date().toISOString(),
          last_check_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', domainId);

      console.log(`[CustomDomainService] ✅ Domain ${domainRecord.domain} verified successfully`);
      return { verified: true, records_found: txtRecords };
    }

    // Token not found
    await this.updateDomainStatus(domainId, {
      last_check_at: new Date().toISOString(),
      last_error: `TXT record found but verification token doesn't match. Expected: ${domainRecord.verification_token}`,
    });

    return { 
      verified: false, 
      error: `Verification token not found in TXT records. Make sure to add exactly: ${domainRecord.verification_token}`,
      records_found: txtRecords 
    };
  }

  /**
   * Activate a verified domain (Step 3: ACTIVE)
   * This adds the domain to Kubernetes Ingress and triggers SSL certificate
   */
  static async activateDomain(domainId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServiceClient();

    // Get domain record with app details
    const { data: domainRecord, error: fetchError } = await supabase
      .from('platform_app_domains')
      .select('*, platform_apps!inner(id, name, slug, status)')
      .eq('id', domainId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !domainRecord) {
      return { success: false, error: 'Domain not found or access denied' };
    }

    if (domainRecord.status !== 'verified') {
      return { success: false, error: `Domain must be verified before activation. Current status: ${domainRecord.status}` };
    }

    const app = domainRecord.platform_apps;
    if (app.status !== 'running') {
      return { success: false, error: 'App must be running before activating custom domain' };
    }

    // Ensure DNS is already routing to the platform before kicking off ingress changes
    try {
      await this.ensureDomainPointsToPlatform(domainRecord.domain);
    } catch (dnsError: unknown) {
      const message = dnsError instanceof Error ? dnsError.message : 'Domain DNS not pointing to platform ingress';
      return { success: false, error: message };
    }

    // Update SSL status to issuing
    await supabase
      .from('platform_app_domains')
      .update({ ssl_status: 'issuing' })
      .eq('id', domainId);

    try {
      // Import and use Kubernetes service to add custom domain to Ingress
      const { KubernetesCustomDomainService } = await import('./kubernetes-custom-domain');
      
      await KubernetesCustomDomainService.addCustomDomainToIngress(
        app.name,
        domainRecord.domain
      );

      // Mark as active
      await supabase
        .from('platform_app_domains')
        .update({
          status: 'active',
          activated_at: new Date().toISOString(),
          ssl_status: 'active',
          last_error: null,
        })
        .eq('id', domainId);

      // Update app's has_custom_domains flag
      await supabase
        .from('platform_apps')
        .update({ has_custom_domains: true })
        .eq('id', domainRecord.app_id);

      console.log(`[CustomDomainService] ✅ Domain ${domainRecord.domain} activated for app ${app.name}`);
      return { success: true };

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[CustomDomainService] Activation error:', errorMessage);

      await supabase
        .from('platform_app_domains')
        .update({
          status: 'failed',
          ssl_status: 'failed',
          last_error: errorMessage,
        })
        .eq('id', domainId);

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Remove a custom domain from an app
   */
  static async removeDomain(domainId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServiceClient();

    // Get domain record with app details
    const { data: domainRecord, error: fetchError } = await supabase
      .from('platform_app_domains')
      .select('*, platform_apps!inner(id, name, custom_domain)')
      .eq('id', domainId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !domainRecord) {
      return { success: false, error: 'Domain not found or access denied' };
    }

    const app = domainRecord.platform_apps;
    const wasPrimary = domainRecord.is_primary;
    const removedDomain = domainRecord.domain;

    // If domain was active, remove from Ingress
    if (domainRecord.status === 'active') {
      try {
        const { KubernetesCustomDomainService } = await import('./kubernetes-custom-domain');
        await KubernetesCustomDomainService.removeCustomDomainFromIngress(
          app.name,
          domainRecord.domain
        );
      } catch (error: unknown) {
        console.error('[CustomDomainService] Error removing from Ingress:', error);
        // Continue with removal even if Ingress cleanup fails
      }
    }

    // Mark domain as removed (soft delete for audit trail)
    await supabase
      .from('platform_app_domains')
      .update({
        status: 'removed',
        is_primary: false, // Clear primary flag on removal
        updated_at: new Date().toISOString(),
      })
      .eq('id', domainId);

    // Check if app still has any active custom domains
    const { data: remainingDomains, count } = await supabase
      .from('platform_app_domains')
      .select('*', { count: 'exact' })
      .eq('app_id', domainRecord.app_id)
      .eq('status', 'active');

    // Prepare app updates
    const appUpdates: { has_custom_domains?: boolean; custom_domain?: string | null } = {};

    if (count === 0) {
      // No more active domains
      appUpdates.has_custom_domains = false;
      appUpdates.custom_domain = null;
    } else if (wasPrimary || app.custom_domain === removedDomain) {
      // Primary domain was removed, or the custom_domain field points to the removed domain
      // Set a new primary from remaining active domains
      if (remainingDomains && remainingDomains.length > 0) {
        const newPrimary = remainingDomains[0];
        appUpdates.custom_domain = newPrimary.domain;
        
        // Mark the first remaining domain as primary
        await supabase
          .from('platform_app_domains')
          .update({ is_primary: true })
          .eq('id', newPrimary.id);
        
        console.log(`[CustomDomainService] Set ${newPrimary.domain} as new primary domain`);
      } else {
        appUpdates.custom_domain = null;
      }
    }

    // Apply app updates if any
    if (Object.keys(appUpdates).length > 0) {
      await supabase
        .from('platform_apps')
        .update(appUpdates)
        .eq('id', domainRecord.app_id);
    }

    console.log(`[CustomDomainService] ✅ Domain ${removedDomain} removed from app ${app.name}`);
    return { success: true };
  }

  /**
   * List all custom domains for an app
   */
  static async listDomains(appId: string, userId: string): Promise<CustomDomainWithStatus[]> {
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from('platform_app_domains')
      .select('*')
      .eq('app_id', appId)
      .eq('user_id', userId)
      .neq('status', 'removed')
      .order('created_at', { ascending: true });

    if (error || !data) {
      console.error('[CustomDomainService] Error listing domains:', error);
      return [];
    }

    return Promise.all(
      data.map(async (domain) => this.decorateDomainWithRouting(domain as CustomDomain))
    );
  }

  /**
   * Get a single domain by ID
   */
  static async getDomain(domainId: string, userId: string): Promise<CustomDomainWithStatus | null> {
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from('platform_app_domains')
      .select('*')
      .eq('id', domainId)
      .eq('user_id', userId)
      .single();

    if (error) {
      return null;
    }

    return this.decorateDomainWithRouting(data as CustomDomain);
  }

  /**
   * Set a domain as primary
   */
  static async setPrimaryDomain(domainId: string, userId: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createServiceClient();

    // Get domain record
    const { data: domainRecord, error: fetchError } = await supabase
      .from('platform_app_domains')
      .select('*')
      .eq('id', domainId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !domainRecord) {
      return { success: false, error: 'Domain not found or access denied' };
    }

    if (domainRecord.status !== 'active') {
      return { success: false, error: 'Only active domains can be set as primary' };
    }

    // Unset any existing primary domains for this app
    await supabase
      .from('platform_app_domains')
      .update({ is_primary: false })
      .eq('app_id', domainRecord.app_id);

    // Set this domain as primary
    await supabase
      .from('platform_app_domains')
      .update({ is_primary: true })
      .eq('id', domainId);

    // Update the app's custom_domain field for quick reference
    await supabase
      .from('platform_apps')
      .update({ custom_domain: domainRecord.domain })
      .eq('id', domainRecord.app_id);

    console.log(`[CustomDomainService] ✅ Set ${domainRecord.domain} as primary domain`);
    return { success: true };
  }

  /**
   * Helper: Update domain status fields
   */
  private static async updateDomainStatus(
    domainId: string, 
    fields: Partial<CustomDomain>
  ): Promise<void> {
    const supabase = await createServiceClient();
    await supabase
      .from('platform_app_domains')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', domainId);
  }

  /**
   * Get all active domains for an app (for Ingress generation)
   */
  static async getActiveDomainsForApp(appId: string): Promise<string[]> {
    const supabase = await createServiceClient();

    const { data, error } = await supabase
      .from('platform_app_domains')
      .select('domain')
      .eq('app_id', appId)
      .eq('status', 'active');

    if (error) {
      console.error('[CustomDomainService] Error getting active domains:', error);
      return [];
    }

    return data.map(d => d.domain);
  }

  /**
   * Ensure the domain's DNS already resolves to the platform ingress IP before activation
   */
  private static async ensureDomainPointsToPlatform(domain: string): Promise<void> {
    const status = await this.getDomainRoutingStatus(domain);
    if (!status.ready) {
      throw new Error(status.message || `DNS for ${domain} is not pointing to the platform ingress yet.`);
    }
  }

  private static getExpectedIngressIps(): string[] {
    const ingressIpRaw = process.env.KUBE_IP?.trim();

    if (!ingressIpRaw) {
      throw new Error('Platform ingress IP (KUBE_IP) is not configured. Please contact support.');
    }

    const expectedIps = ingressIpRaw.split(',').map(ip => ip.trim()).filter(Boolean);

    if (expectedIps.length === 0) {
      throw new Error('Platform ingress IP (KUBE_IP) is misconfigured. Please contact support.');
    }

    return expectedIps;
  }

  private static async resolveDomainIps(domain: string): Promise<string[]> {
    const ipv4 = await this.resolveWithCustomResolver(domain, 4);
    const ipv6 = await this.resolveWithCustomResolver(domain, 6);
    return [...ipv4, ...ipv6];
  }

  private static resolveWithCustomResolver(
    domain: string,
    family: 4 | 6
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const handler = (err: NodeJS.ErrnoException | null, addresses: string[]) => {
        if (err) {
          if (err.code === 'ENOTFOUND' || err.code === 'ENODATA' || err.code === 'EAI_AGAIN') {
            return resolve([]);
          }
          return reject(err);
        }
        resolve(addresses || []);
      };

      try {
        if (family === 4) {
          customResolver.resolve4(domain, handler);
        } else {
          customResolver.resolve6(domain, handler);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private static async getDomainRoutingStatus(domain: string): Promise<DomainRoutingStatus> {
    const expectedIps = this.getExpectedIngressIps();

    try {
      const resolvedIps = await this.resolveDomainIps(domain);

      if (resolvedIps.length === 0) {
        return {
          ready: false,
          resolved_ips: [],
          expected_ips: expectedIps,
          message: `No DNS records detected yet. Point ${domain} to ${expectedIps.join(', ')} and wait for propagation.`,
        };
      }

      const matches = resolvedIps.some((ip) => expectedIps.includes(ip));
      if (matches) {
        return {
          ready: true,
          resolved_ips: resolvedIps,
          expected_ips: expectedIps,
          message: `DNS is correctly pointing to the platform ingress.`,
        };
      }

      return {
        ready: false,
        resolved_ips: resolvedIps,
        expected_ips: expectedIps,
        message: `DNS currently resolves to ${resolvedIps.join(', ')}. Update the record to ${expectedIps.join(', ')} before activation.`,
      };
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err?.code === 'ENOTFOUND' || err?.code === 'EAI_AGAIN') {
        return {
          ready: false,
          resolved_ips: [],
          expected_ips: expectedIps,
          message: `Unable to resolve ${domain}. Make sure the domain points to ${expectedIps.join(', ')}.`,
        };
      }

      console.error('[CustomDomainService] DNS routing check failed:', error);
      return {
        ready: false,
        resolved_ips: [],
        expected_ips: expectedIps,
        message: err?.message || 'Failed to check DNS routing. Please try again later.',
      };
    }
  }

  private static async decorateDomainWithRouting(domain: CustomDomain): Promise<CustomDomainWithStatus> {
    try {
      const status = await this.getDomainRoutingStatus(domain.domain);
      return {
        ...domain,
        dns_ready: status.ready,
        dns_message: status.message,
        dns_resolved_ips: status.resolved_ips,
        dns_expected_ips: status.expected_ips,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to validate DNS';
      const expectedIps = (() => {
        try {
          return this.getExpectedIngressIps();
        } catch {
          return [];
        }
      })();

      return {
        ...domain,
        dns_ready: false,
        dns_message: message,
        dns_resolved_ips: [],
        dns_expected_ips: expectedIps,
      };
    }
  }
}
