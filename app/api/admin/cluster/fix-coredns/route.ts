import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth/check-admin";
import { KubernetesCustomDomainService } from "@/lib/services/kubernetes-custom-domain";

/**
 * POST /api/admin/cluster/fix-coredns
 *
 * One-time cluster bootstrap: patches CoreDNS to forward to public DNS
 * resolvers (8.8.8.8 / 8.8.4.4 / 1.1.1.1) instead of the private VPC
 * /etc/resolv.conf. Must be run once after provisioning a new cluster so
 * that cert-manager HTTP-01 challenges can resolve external hostnames.
 *
 * This is intentionally a separate admin operation and NOT part of the
 * per-domain activation pipeline to avoid concurrent kubectl patches.
 */
export async function POST() {
  const auth = await checkAdminAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await KubernetesCustomDomainService.runClusterDnsBootstrap();
    return NextResponse.json({ success: true, message: "CoreDNS patched to use public DNS resolvers." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[admin/cluster/fix-coredns] Failed:", message);
    return NextResponse.json({ error: "Failed to patch CoreDNS", detail: message }, { status: 500 });
  }
}
