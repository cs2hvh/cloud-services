/**
 * Domain API Response Serializers
 *
 * These functions project only the fields declared in the OpenAPI schema,
 * preventing internal fields (user_id, idempotency_key, request_data, etc.)
 * from leaking into v1 API responses.
 */
import type {
  DomainRecord,
  DomainRecordWithRouting,
  DomainOperation,
  DomainPurchaseRequest,
} from "@/lib/domain-service/core/types";

/** Serialize a DomainRecord for public API responses — strips user_id. */
export function serializeDomain(record: DomainRecord) {
  return {
    id: record.id,
    app_id: record.app_id,
    domain: record.domain,
    status: record.status,
    verification_method: record.verification_method,
    verification_token: record.verification_token,
    verified_at: record.verified_at,
    activated_at: record.activated_at,
    ssl_status: record.ssl_status,
    is_primary: record.is_primary,
    redirect_to_primary: record.redirect_to_primary,
    last_error: record.last_error,
    last_check_at: record.last_check_at,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

/**
 * Serialize a DomainRecordWithRouting for the list endpoint.
 * Strips user_id while including the live DNS routing fields.
 */
export function serializeDomainWithRouting(record: DomainRecordWithRouting) {
  return {
    ...serializeDomain(record),
    dns_ready: record.dns_ready,
    dns_message: record.dns_message,
    dns_resolved_ips: record.dns_resolved_ips,
    dns_expected_ips: record.dns_expected_ips,
  };
}

/**
 * Serialize a DomainOperation for public API responses.
 * Strips: user_id, idempotency_key, request_data, response_data, provider_request_id.
 */
export function serializeDomainOperation(op: DomainOperation) {
  return {
    id: op.id,
    action: op.action,
    status: op.status,
    domain_id: op.domain_id,
    error_code: op.error_code,
    error_message: op.error_message,
    retryable: op.retryable,
    started_at: op.started_at,
    finished_at: op.finished_at,
    created_at: op.created_at,
    updated_at: op.updated_at,
  };
}

// Internal-only metadata keys managed by the renewal cron and billing system.
// Never expose these to API consumers — they are implementation details.
const INTERNAL_METADATA_KEYS = new Set([
  "renewal_charged",
  "last_renewal_charged_at",
]);

/**
 * Serialize a DomainPurchaseRequest for public API responses.
 * Strips: user_id, idempotency_key, provider_request_id.
 * Strips internal billing-cron metadata keys from metadata object.
 */
export function serializeDomainPurchaseRequest(request: DomainPurchaseRequest) {
  const publicMetadata = Object.fromEntries(
    Object.entries(request.metadata ?? {}).filter(([k]) => !INTERNAL_METADATA_KEYS.has(k))
  );

  return {
    id: request.id,
    app_id: request.app_id,
    domain: request.domain,
    status: request.status,
    purchase_price: request.purchase_price,
    renewal_price: request.renewal_price,
    currency: request.currency,
    provider: request.provider,
    last_error: request.last_error,
    metadata: publicMetadata,
    created_at: request.created_at,
    updated_at: request.updated_at,
  };
}
