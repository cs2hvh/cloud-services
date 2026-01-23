// ============================================
// SENSITIVE DATA SANITIZATION
// Redacts passwords, tokens, and keys from audit logs
// ============================================

const SENSITIVE_FIELDS = [
  'password',
  'secret_key',
  'key_id',
  'access_key',
  'kubeconfig',
  'kube_config',
  'token',
  'access_token',
  'refresh_token',
  'ca_certificate',
  'private_connection.password',
  'public_connection.password',
  'credentials',
  'api_key',
  'secret',
  'auth',
  'authorization',
];

const REDACTED = '[REDACTED]';

/**
 * Sanitize state object by redacting sensitive fields
 * @param state - Object to sanitize
 * @returns Sanitized object with sensitive fields redacted
 */
export function sanitizeState(
  state: Record<string, unknown>
): Record<string, unknown> {
  if (!state || typeof state !== 'object') return state;

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(state)) {
    const lowerKey = key.toLowerCase();

    // Check if field should be redacted
    if (isSensitiveField(lowerKey)) {
      sanitized[key] = REDACTED;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively sanitize nested objects
      sanitized[key] = sanitizeState(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      // Handle arrays
      sanitized[key] = value.map(item =>
        typeof item === 'object' && item !== null
          ? sanitizeState(item as Record<string, unknown>)
          : item
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Check if a field name indicates sensitive data
 */
function isSensitiveField(fieldName: string): boolean {
  return SENSITIVE_FIELDS.some(sensitive => 
    fieldName.includes(sensitive.toLowerCase())
  );
}

/**
 * Sanitize a database connection object (special handling)
 */
export function sanitizeConnection(
  connection: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...connection,
    password: REDACTED,
    uri: connection.uri ? '[REDACTED_URI]' : undefined,
  };
}
