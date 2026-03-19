export interface CustomDomain {
  id: string;
  app_id: string;
  domain: string;
  status: 'pending' | 'verified' | 'active' | 'failed' | 'removed';
  verification_token: string;
  verification_method: string;
  verified_at: string | null;
  activated_at: string | null;
  ssl_status: string;
  is_primary: boolean;
  last_error: string | null;
  created_at: string;
  dns_ready?: boolean;
  dns_message?: string;
  dns_resolved_ips?: string[];
  dns_expected_ips?: string[];
}

export interface DomainInventoryItem {
  domain: string;
  source: 'purchased' | 'external' | 'mixed';
  purchase: {
    status: 'requested' | 'processing' | 'completed' | 'failed' | 'cancelled';
  } | null;
}

export interface CustomDomainsManagerProps {
  appId: string;
  appStatus: string;
  platformDomain: string;
}

export type AddDomainMode = 'existing' | 'external';

export interface VerificationInstructions {
  record_type: string;
  record_name: string;
  record_value: string;
}
