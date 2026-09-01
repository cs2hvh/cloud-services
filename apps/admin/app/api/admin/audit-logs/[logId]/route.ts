// Re-export of the main app's handler (single implementation during migration).
export { GET } from "@/app/api/admin/audit-logs/[logId]/route";
export const dynamic = "force-dynamic";
