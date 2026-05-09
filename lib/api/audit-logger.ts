/**
 * Structured audit logger.
 *
 * Separate from logError — audit entries record intentional user actions
 * (e.g. viewing secrets), not failures. They must be queryable by event,
 * userId, and resourceId.
 *
 * Output format (one JSON line per event, parseable by log aggregators):
 *   [AUDIT] {"event":"env_vars_accessed","userId":"...","appId":"...","ts":"..."}
 */

const isDev = process.env.NODE_ENV === "development";

export interface AuditPayload {
  userId: string;
  appId?: string;
  key?: string;
  [extra: string]: string | number | boolean | undefined;
}

/**
 * Write a structured audit log entry to stdout.
 *
 * @param event   Short snake_case event name, e.g. "env_vars_accessed"
 * @param payload Structured context — userId always required
 */
export function logAudit(event: string, payload: AuditPayload): void {
  const entry = {
    event,
    ...payload,
    ts: new Date().toISOString(),
  };

  if (isDev) {
    console.log(`[AUDIT]`, entry);
  } else {
    // Single-line JSON — easy to grep/ship via log aggregator
    process.stdout.write(`[AUDIT] ${JSON.stringify(entry)}\n`);
  }
}
