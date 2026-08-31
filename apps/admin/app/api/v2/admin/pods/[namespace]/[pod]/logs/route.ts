// Re-export of the main app's operator handler — guard.ts runs unchanged.
export { GET } from "@/app/api/v2/admin/pods/[namespace]/[pod]/logs/route";
export const dynamic = "force-dynamic";
export const revalidate = 0;
