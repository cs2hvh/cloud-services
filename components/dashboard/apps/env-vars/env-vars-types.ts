// Shared types, constants, and pure utility functions for the env-vars editor.
// No React imports — safe to import from any file.

export interface EnvVar {
  key: string;
  value: string;
  visible?: boolean;
  /** True when this var existed server-side and the user clicked "Reveal" */
  revealed?: boolean;
  /** True when the server confirmed a non-empty value exists for this key */
  hasValue?: boolean;
}

export interface EnvVarsEditorProps {
  value: EnvVar[];
  onChange: (vars: EnvVar[]) => void;
  /** App ID — required for the server-side export endpoint */
  appId?: string;
  /** Called when the user clicks "Reveal" on a masked var. Parent handles the API call. */
  onReveal?: (key: string) => void;
  /** Key currently being fetched — drives the loading spinner in the row */
  revealingKey?: string | null;
}

// Indexed variant used internally so filtered lists keep stable indices
export type IndexedEnvVar = EnvVar & { idx: number };

export const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Keys that likely hold sensitive values
export const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /SECRET/i, /PASSWORD/i, /PASSWD/i, /PRIVATE/i, /TOKEN/i,
  /API_KEY/i, /ACCESS_KEY/i, /AUTH/i, /CREDENTIAL/i, /CERT/i,
  /WEBHOOK/i, /SIGNING/i, /ENCRYPTION/i, /RSA/i, /PEM/i,
];

export const ENV_SUGGESTIONS: string[] = [
  'DATABASE_URL', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
  'REDIS_URL', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD',
  'API_KEY', 'API_SECRET', 'API_URL',
  'JWT_SECRET', 'JWT_EXPIRES_IN',
  'NODE_ENV', 'PORT',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'S3_BUCKET',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'NEXT_PUBLIC_API_URL', 'VITE_API_URL',
];

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some(p => p.test(key));
}

export function normalizeEnvVar(env: Partial<EnvVar> | undefined): EnvVar {
  return {
    key: env?.key ?? '',
    value: env?.value ?? '',
    visible: env?.visible ?? false,
    revealed: env?.revealed ?? false,
    hasValue: env?.hasValue ?? false,
  };
}

export function normalizeEnvKey(key: string): string {
  return key.trim().replace(/[^A-Za-z0-9_]/g, '_');
}

/** Format a single env var as KEY=value, quoting the value when needed. */
export function formatEnvLine(key: string, value: string): string {
  const needsQuotes = value.includes(' ') || value.includes('#') || value === '';
  return `${key}=${needsQuotes ? `"${value}"` : value}`;
}

/** Parse .env file content into EnvVar array, skipping comments and blanks. */
export function parseEnvContent(content: string): EnvVar[] {
  const result: EnvVar[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = normalizeEnvKey(trimmed.substring(0, eqIdx));
    let value = trimmed.substring(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && ENV_KEY_REGEX.test(key)) {
      result.push({ key, value, visible: false });
    }
  }
  return result;
}

/** Validate a single key against the existing list. */
export function validateKey(
  key: string,
  allVars: EnvVar[],
): { valid: boolean; error?: string } {
  if (!key) return { valid: true };
  if (!ENV_KEY_REGEX.test(key)) return { valid: false, error: 'Invalid format' };
  if (allVars.filter(e => e.key === key).length > 1) return { valid: false, error: 'Duplicate' };
  return { valid: true };
}

/** Return autocomplete suggestions for a partial key, excluding already-used keys. */
export function getSuggestions(current: string, usedKeys: Set<string>): string[] {
  if (!current) return [];
  return ENV_SUGGESTIONS
    .filter(s => s.toLowerCase().includes(current.toLowerCase()) && !usedKeys.has(s))
    .slice(0, 5);
}
