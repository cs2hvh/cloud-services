import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth/check-admin";
import { KubernetesMonitor } from "@/lib/services/kubernetes-monitor";
import { logError, sanitizeError } from "@/lib/api/error-sanitizer";

/**
 * GET /api/admin/cluster/deployments
 * Returns deployment health for all namespaces (or a specific one via ?namespace=).
 *
 * GET /api/admin/cluster/deployments?namespace=production&deployment=my-app&diagnostics=true
 * Returns deployment diagnostics for a specific deployment.
 */
export async function GET(req: NextRequest) {
  const { authorized } = await checkAdminAuth();
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    // Sanitize to valid K8s DNS subdomain characters before passing to API calls
    const rawNamespace  = searchParams.get("namespace");
    const namespace     = rawNamespace ? rawNamespace.replace(/[^a-z0-9\-]/g, "") || undefined : undefined;
    const rawDeployment = searchParams.get("deployment");
    const deployment    = rawDeployment ? rawDeployment.replace(/[^a-z0-9\-\.]/g, "") : null;
    const diagnostics = searchParams.get("diagnostics") === "true";

    if (diagnostics && namespace && deployment) {
      const diag = await KubernetesMonitor.getDeploymentDiagnostics(namespace, deployment);
      return NextResponse.json({ success: true, data: diag });
    }

    const data = await KubernetesMonitor.getDeploymentHealth(namespace);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    logError("GET /api/admin/cluster/deployments", error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
