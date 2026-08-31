// Re-export of the main app's operator handler — guard.ts runs unchanged.
export { GET } from "@/app/api/v2/admin/storage/route";
export const dynamic = "force-dynamic";
export const revalidate = 0;
