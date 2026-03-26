export const API_ERROR_MESSAGES: Record<string, string> = {
  DOMAIN_LIMIT_REACHED:
    "You've reached the maximum number of domains for this app. Remove one to add another.",
  DOMAIN_ALREADY_EXISTS: 'This domain is already connected to an app.',
  DOMAIN_ALREADY_IN_USE: 'This domain is already in use by another app.',
  NOT_FOUND: 'Domain not found — it may have already been removed.',
  DOMAIN_NOT_MANAGED: "This domain isn't managed through your account.",
  DOMAIN_NOT_VERIFIED: 'Domain must be verified before activation.',
  OPERATION_IN_PROGRESS: 'Another setup operation is already running for this domain. Please wait.',
  PROVIDER_RATE_LIMITED: 'The provider rate-limited this request. Please wait and try again.',
  INGRESS_APPLY_FAILED: 'Domain setup failed in infrastructure. Please retry in a moment.',
  INTEGRATION_CONFIG_ERROR: 'Platform integration is not fully configured. Contact support if this persists.',
  TOO_MANY_REQUESTS: 'Too many requests — please wait a moment and try again.',
  INTERNAL_ERROR: 'Something went wrong on our end. Please try again.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: "You don't have permission to do that.",
  VALIDATION_ERROR: 'Please check your input and try again.',
};

export function looksInternal(msg: string): boolean {
  return /supabase|postgres|sql[\s(]|stack trace|node_modules|\.ts:\d|undefined is not|cannot read property|fetch failed|econnrefused|503|500 internal|jenkins|kubernetes|ingress|cert-manager|clusterissuer/i.test(
    msg,
  );
}

export function friendlyError(
  data: Record<string, unknown> | null | undefined,
  fallback: string,
): string {
  const code = typeof data?.error === 'string' ? data.error : '';
  const message = typeof data?.message === 'string' ? data.message : '';
  if (code === 'PROVIDER_RATE_LIMITED' && message && !looksInternal(message)) return message;
  if (code && API_ERROR_MESSAGES[code]) return API_ERROR_MESSAGES[code];
  if (message && !looksInternal(message)) return message;
  return fallback;
}

export function sanitizeOperationError(
  msg: string | undefined | null,
  fallback: string,
): string {
  if (!msg) return fallback;
  if (looksInternal(msg)) return fallback;
  return msg;
}

export function normalizeDomainInput(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '');
}

export function sanitizeSubdomainLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
}

export function operationFailureFallback(errorCode: unknown): string {
  if (errorCode === 'PROVIDER_RATE_LIMITED') {
    return 'Provider rate limit reached for this domain. Please wait before retrying activation.';
  }
  if (errorCode === 'INTEGRATION_CONFIG_ERROR') {
    return 'Platform dependency is temporarily unavailable. Please retry in a minute.';
  }
  if (errorCode === 'INGRESS_APPLY_FAILED') {
    return 'Domain setup failed. Please retry activation.';
  }
  return 'Domain setup failed. Please try again or contact support.';
}
