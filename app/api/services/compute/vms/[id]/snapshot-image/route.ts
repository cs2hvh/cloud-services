export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot-from-server is TEMPORARILY DISABLED.
//
// The full implementation (stopped-VM disk export via `qemu-img convert` →
// presigned PUT to R2 → lazy per-host build from a signed GET URL) lives in git
// history at commit 67cdef63. To re-enable:
//   1. Restore that version of this file.
//   2. Re-add the "Create image" (VpsSnapshotSection) section to
//      app/dashboard/services/compute/vps/[id]/_components/vps-settings-tab.tsx.
//   3. Ensure the R2 bucket (R2_CUSTOM_IMAGES_BUCKET / ahura-custom-images) exists.
//
// URL-import custom images remain fully enabled (those are pulled host-direct
// and never staged in our storage).
// ─────────────────────────────────────────────────────────────────────────────
export async function POST() {
  return Response.json(
    { ok: false, error: "Creating an image from a server isn't available yet." },
    { status: 503 }
  );
}
