const LOGICAL_DATABASE_ENGINES = new Set(["pg", "mysql", "mongodb"]);

export function supportsDashboardLogicalDatabases(
  engine: string | null | undefined
): boolean {
  if (!engine) {
    return false;
  }

  return LOGICAL_DATABASE_ENGINES.has(engine.toLowerCase());
}

export function getAccessTabLabel(
  engine: string | null | undefined
): string {
  return supportsDashboardLogicalDatabases(engine) ? "Users & DBs" : "Users";
}

export function getAccessTabDescription(
  engine: string | null | undefined
): string {
  return supportsDashboardLogicalDatabases(engine)
    ? "Create users, reset credentials, and manage logical databases."
    : "Create users, rotate credentials, and review engine-specific access limits.";
}
