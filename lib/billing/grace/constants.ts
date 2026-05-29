export const GRACE_SERVICE_TABLES = [
  "active_kubernetes",
  "active_database",
  "active_objectspace",
  "active_spectrum",
  "active_platform_apps",
  "active_inference_vector",
  "active_compute",
] as const;

export type GraceServiceTable = (typeof GRACE_SERVICE_TABLES)[number];

export const GRACE_ACTIVE_STATES = ["grace", "deletion_scheduled"] as const;

export const DEFAULT_GRACE_PERIOD_DAYS = 7;
export const DEFAULT_RECOVERY_MIN_HOURS = 1;

export function getGracePeriodDays(): number {
  const parsed = Number(process.env.BILLING_GRACE_PERIOD_DAYS ?? DEFAULT_GRACE_PERIOD_DAYS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GRACE_PERIOD_DAYS;
}

export function getRecoveryMinHoursCoverage(): number {
  const parsed = Number(
    process.env.BILLING_RECOVERY_MIN_HOURS_COVERAGE ?? DEFAULT_RECOVERY_MIN_HOURS
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RECOVERY_MIN_HOURS;
}

export function isGraceServiceTable(value: string): value is GraceServiceTable {
  return GRACE_SERVICE_TABLES.includes(value as GraceServiceTable);
}
