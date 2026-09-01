// Re-export of the main app's operator handler — guard.ts runs unchanged.
// (Written by this lane, upstreamed by the v2 lane; single implementation.)
export { GET } from "@/app/api/v2/admin/sweeps/route";
export const dynamic = "force-dynamic";
export const revalidate = 0;
