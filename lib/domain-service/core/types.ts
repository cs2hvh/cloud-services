export type DomainStatus = "pending" | "verified" | "active" | "failed" | "removed";

export type OperationStatus = "pending" | "running" | "succeeded" | "failed";
export type DomainPurchaseRequestStatus =
  | "requested"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export type DomainTransferRequestStatus =
  | "initiated"
  | "pending"
  | "approved"
  | "completed"
  | "failed"
  | "cancelled";

export interface DomainRecord {
  id: string;
  app_id: string;
  user_id: string;
  domain: string;
  status: DomainStatus;
  verification_token: string;
  verification_method: "txt" | "cname";
  verified_at: string | null;
  activated_at: string | null;
  ssl_status: "pending" | "issuing" | "active" | "failed";
  is_primary: boolean;
  redirect_to_primary: boolean;
  last_error: string | null;
  last_check_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DomainOperation {
  id: string;
  user_id: string;
  action: string;
  status: OperationStatus;
  domain_id: string | null;
  idempotency_key: string | null;
  request_data: Record<string, unknown>;
  response_data: Record<string, unknown> | null;
  provider_request_id: string | null;
  error_code: string | null;
  error_message: string | null;
  retryable: boolean;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DomainPurchaseRequest {
  id: string;
  user_id: string;
  app_id: string | null;
  domain: string;
  status: DomainPurchaseRequestStatus;
  purchase_price: number | null;
  renewal_price: number | null;
  currency: string;
  provider: string;
  idempotency_key: string | null;
  provider_request_id: string | null;
  last_error: string | null;
  registrant_email: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DomainTransferRequest {
  id: string;
  user_id: string;
  domain: string;
  status: DomainTransferRequestStatus;
  auth_code_hash: string | null;
  purchase_price: number | null;
  renewal_price: number | null;
  currency: string;
  provider: string;
  provider_order_id: string | null;
  provider_status: string | null;
  provider_email: string | null;
  idempotency_key: string | null;
  last_error: string | null;
  failure_reason: string | null;
  last_polled_at: string | null;
  poll_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface DomainAuditContext {
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export interface ActorContext {
  userId: string;
  userEmail?: string;
  userName?: string;
  userRole?: "user" | "admin" | "system";
  auditContext?: DomainAuditContext;
}

export interface AppRecord {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  status?: string;
  project_id?: string | null;
}

export interface DnsRoutingStatus {
  ready: boolean;
  resolved_ips: string[];
  expected_ips: string[];
  message: string;
}

export type DomainRecordWithRouting = DomainRecord & {
  dns_ready: boolean;
  dns_message: string;
  dns_resolved_ips: string[];
  dns_expected_ips: string[];
};
