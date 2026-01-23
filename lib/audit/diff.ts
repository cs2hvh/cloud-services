// ============================================
// STATE DIFF COMPUTATION
// Computes before/after changes for UPDATE actions
// ============================================

export interface FieldChange {
  old: unknown;
  new: unknown;
}

/**
 * Compute changes between before and after states
 * @param before - State before update
 * @param after - State after update
 * @returns Object with changed fields
 */
export function computeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};

  // Get all unique keys from both objects
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    // Skip timestamp fields that always change
    if (isIgnoredField(key)) continue;

    const oldValue = before[key];
    const newValue = after[key];

    // Check if values are different
    if (!areEqual(oldValue, newValue)) {
      changes[key] = { old: oldValue, new: newValue };
    }
  }

  return changes;
}

/**
 * Fields to ignore when computing diffs
 */
function isIgnoredField(fieldName: string): boolean {
  const ignored = [
    'updated_at',
    'read_at',
    'last_billed_at',
  ];
  return ignored.includes(fieldName);
}

/**
 * Deep equality check for values
 */
function areEqual(a: unknown, b: unknown): boolean {
  // Handle primitives
  if (a === b) return true;
  
  // Handle null/undefined
  if (a == null || b == null) return a === b;
  
  // Handle arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => areEqual(item, b[index]));
  }
  
  // Handle objects
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  
  return false;
}

/**
 * Format changes for human-readable display
 */
export function formatChanges(
  changes: Record<string, FieldChange>
): string[] {
  return Object.entries(changes).map(([key, { old, new: newVal }]) => {
    const oldStr = formatValue(old);
    const newStr = formatValue(newVal);
    return `${key}: ${oldStr} → ${newStr}`;
  });
}

/**
 * Format a value for display
 */
function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
