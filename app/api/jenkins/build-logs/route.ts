import { NextRequest, NextResponse } from "next/server";
import { JenkinsService } from "@/lib/services/jenkins";
import { PlatformAppLogRetentionService } from "@/lib/services/platform-app-log-retention";
import { sanitizeError, logError } from "@/lib/api/error-sanitizer";
import { authenticateUser } from "@/lib/auth/server-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { limitByUser } from "@/lib/cooldown/userbased";

async function getOwnedAppId(userId: string, appName: string): Promise<string | null> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("platform_apps")
    .select("id")
    .eq("name", appName)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ?? null;
}

// Docker/build-system lines to drop — layer hashes, cache ops, and internal plumbing.
const DROP_DOCKER_PATTERNS = [
  /^#\d+\s+(DONE|CACHED|\[internal\]|\[auth\]|\[deps|\[builder|\[runner)/,
  /sha256:[a-f0-9]{10,}/,
  /^#\d+\s+(importing|resolve |extracting|transferring|inferred)/,
];

function sanitizeBuildLogs(raw: string): string {
  if (!raw) return raw;

  const lines = raw.split('\n');
  const out: string[] = [];
  let firstStageFound = false;
  let skipRouteTable = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // ── Drop Next.js route table (reveals internal /api/... paths) ───────────
    if (/Route \(app\)\s+Size/.test(line)) skipRouteTable = true;
    if (skipRouteTable) {
      if (trimmed && !/^[#ƒ○λ┌├└ ]/.test(trimmed)) skipRouteTable = false;
      if (skipRouteTable) continue;
    }

    // ── Drop everything before first [STAGE] (agent YAML, k8s metadata) ─────
    if (!firstStageFound) {
      if (line.includes('[STAGE]')) firstStageFound = true;
      else continue;
    }

    // ── Drop lines too long to be human-readable ─────────────────────────────
    // Trivy embeds entire minified JS bundle file contents in its scan output.
    if (trimmed.length > 500) continue;

    // ── Drop internal file paths ─────────────────────────────────────────────
    if (/\.\/infra\/jenkins\//i.test(line)) continue;

    // ── Drop raw kubectl command lines ────────────────────────────────────────
    if (/^\s*kubectl\s+/.test(trimmed)) continue;

    // ── Replace k8s pod name messages with friendly text ─────────────────────
    if (/\w+-job-\d+-\w+-\w+-\w+/.test(line)) {
      if (/seems to be (removed or )?offline/i.test(line))
        out.push('Build agent temporarily unavailable, reconnecting...');
      else if (/is back online/i.test(line))
        out.push('Build agent reconnected');
      continue;
    }

    // ── Drop noisy Docker layer lines (hashes, cache hits, internal ops) ─────
    if (/^#\d+/.test(trimmed)) {
      if (DROP_DOCKER_PATTERNS.some(p => p.test(trimmed))) continue;
    }

    // ── Drop Trivy vulnerability table (box-drawing lines) ────────────────────
    if (/^[┌├└│]/.test(trimmed)) continue;

    // ── Drop Trivy separator lines ────────────────────────────────────────────
    if (/^[═─]{20,}$/.test(trimmed)) continue;

    // ── Drop Trivy secrets scan output — reveals internal /app/.next/ paths ──
    if (/\/app\/\.next\//.test(trimmed)) continue;
    // Orphaned severity labels and "JWT token" text left after hiding file paths
    if (/^(CRITICAL|HIGH|MEDIUM|LOW|UNKNOWN): \S+ \(\S+\)$/.test(trimmed)) continue;
    if (/^JWT token$/.test(trimmed)) continue;
    // "added by 'COPY'" context lines from Trivy
    if (/\(added by '/.test(trimmed)) continue;

    // ── Drop kubectl table headers ────────────────────────────────────────────
    if (/^NAME\s+(READY|STATUS|SECRET)/.test(trimmed)) continue;

    // ── Drop kubectl get deployment rows (e.g. "app   2/2   2   2   11d") ────
    if (/\s+\d+\/\d+\s+\d+\s+\d+\s+\d+[dhms]$/.test(trimmed)) continue;

    // ── Drop kubectl get pods rows (ReplicaSet+pod hash suffix) ──────────────
    if (/-[a-f0-9]{8,10}-[a-z0-9]{4,5}\s+\d+\/\d+\s+(Running|Pending|Error|CrashLoop|Terminating|ImagePull|Init)/.test(trimmed)) continue;

    // ── Drop kubectl wait condition output ────────────────────────────────────
    if (/\S+ condition met$/.test(trimmed)) continue;

    // ── Drop internal k8s service/cert resource apply lines ──────────────────
    if (/-(service|cert)\s+(unchanged|configured|created)$/.test(trimmed)) continue;

    // ── Drop kubectl get certificate rows (TLS secret name) ──────────────────
    if (/\s+(True|False)\s+\S+-tls\s+\d+[dhms]$/.test(trimmed)) continue;

    // ── Drop Trivy code context lines (line-number + 3+ spaces + source) ─────
    if (/^\d{1,4}\s{3,}/.test(trimmed)) continue;

    // ── Drop standalone line-number references from Trivy ────────────────────
    if (/^\d{1,3}$/.test(trimmed)) continue;

    // ── Term substitutions ───────────────────────────────────────────────────
    const sanitized = line
      // Stage/section name cleanup (bracketed and plain formats)
      .replace(/\[STAGE\] Deploy to Kubernetes/gi, '[STAGE] Deploy Application')
      .replace(/\[STAGE\] Verify Kubernetes/gi, '[STAGE] Verify Deployment')
      .replace(/STAGE: Deploy to Kubernetes/gi, 'STAGE: Deploy Application')
      .replace(/STAGE: Verify Kubernetes/gi, 'STAGE: Verify Deployment')
      .replace(/Security - Kubernetes Manifest Validation/gi, 'Security - Manifest Validation')
      .replace(/\[STAGE:K8S-VALIDATION\]/g, '[STAGE:MANIFEST-VALIDATION]')
      .replace(/K8S-VALIDATION/g, 'MANIFEST-VALIDATION')
      .replace(/Kubernetes manifest validation/gi, 'Manifest validation')
      .replace(/K8s manifest validation/gi, 'Manifest validation')
      .replace(/checking for K8s manifests/gi, 'checking configuration manifests')
      // Generating manifest lines
      .replace(/Generating Kubernetes (deployment|service|routing|ingress) manifest/gi, 'Configuring application settings')
      .replace(/Generating (deployment|service|routing|ingress) manifest/gi, 'Configuring application settings')
      .replace(/Generating certificate manifest/gi, 'Configuring SSL settings')
      // Secret/config lines
      .replace(/Creating Kubernetes secret:/gi, 'Applying application configuration:')
      .replace(/Kubernetes secret/gi, 'application configuration')
      // Status check lines
      .replace(/Fetching (pod|deployment|service|ingress|routing) status/gi, 'Checking deployment status')
      .replace(/Fetching deployment, service, and (ingress|routing) status/gi, 'Checking deployment status')
      // Docker registry username
      .replace(/\bhav0ky\//g, '')
      // Infrastructure term replacements (case-insensitive catch-all last)
      .replace(/\bKUBERNETES\b/g, 'PLATFORM')
      .replace(/\bKubernetes\b/g, 'Platform')
      .replace(/\bkubernetes\b/g, 'platform')
      .replace(/\bk8s\b/gi, 'platform')
      .replace(/\bingress\b/gi, 'routing')
      .replace(/\bpods?\b/gi, (m) => m.toLowerCase() === 'pod' ? 'instance' : 'instances')
      .replace(/\breplicas?\b/gi, (m) => m.toLowerCase() === 'replica' ? 'instance' : 'instances')
      .replace(/\bDeploy to Kubernetes\b/gi, 'Deploy Application')
      // Label cleanup
      .replace(/^PIPELINE:/, 'BUILD:')
      .replace(/Deployment Pipeline/, 'Pipeline')
      .replace(/Container Port:/, 'Application Port:');

    out.push(sanitized);
  }

  return out.join('\n');
}

/**
 * GET /api/jenkins/build-logs?app=myapp&build=1&start=0
 * Get Jenkins build logs for an app
 */
export async function GET(req: NextRequest) {
  // Parse URL/search params inside try so malformed URLs don't throw outside
  // the route handler and cause an unhandled exception in Next.
  let searchParams: URLSearchParams;
  try {
    searchParams = new URL(req.url).searchParams;
  } catch {
    return NextResponse.json({ error: "Invalid request URL" }, { status: 400 });
  }

  const appName = searchParams.get("app");
  const buildNumber = searchParams.get("build");
  const start = searchParams.get("start") || "0";

  try {
    const auth = await authenticateUser();
    if (!auth.authenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await limitByUser(auth.user!.id, {
      prefix: "rl:jenkins-build-logs",
      limit: 180,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too Many Requests", message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    if (!appName) {
      return NextResponse.json(
        { error: "Missing 'app' parameter" },
        { status: 400 }
      );
    }

    if (!buildNumber) {
      return NextResponse.json(
        { error: "Missing 'build' parameter" },
        { status: 400 }
      );
    }

    const buildNum = parseInt(buildNumber, 10);
    const startOffset = parseInt(start, 10);

    if (isNaN(buildNum) || isNaN(startOffset)) {
      return NextResponse.json(
        { error: "Invalid build number or start offset" },
        { status: 400 }
      );
    }

    const appId = await getOwnedAppId(auth.user!.id, appName);
    if (!appId) {
      return NextResponse.json({ error: "App not found" }, { status: 404 });
    }

    const deploymentOnly = searchParams.get("deployment") === "true";

    if (deploymentOnly) {
      const cached = await PlatformAppLogRetentionService.retrieve(appId, buildNum);
      const logs = sanitizeBuildLogs(cached ?? await JenkinsService.getDeploymentLog(appName, buildNum) ?? '');
      return NextResponse.json({
        app_name: appName,
        build_number: buildNum,
        start: startOffset,
        logs,
        next_start: startOffset + logs.length,
        more: false,
        cached: cached !== null,
      });
    }

    // Progressive log fetch — returns proper byte offset (X-Text-Size) and more flag
    const result = await JenkinsService.getBuildLog(appName, buildNum, startOffset);
    const logs = sanitizeBuildLogs(result.text ?? '');

    return NextResponse.json({
      app_name: appName,
      build_number: buildNum,
      start: startOffset,
      logs,
      next_start: result.nextStart,
      more: result.more,
    });
  } catch (error: unknown) {
    // Jenkins returns "not found" while the build is still queuing (before logs exist).
    // Return an empty 200 so the client retries silently instead of showing an error toast.
    const isNotFound = (error as { notFound?: boolean })?.notFound === true ||
      (error instanceof Error && error.message.includes('not found'));

    if (isNotFound) {
      const buildNum = parseInt(buildNumber || '0', 10);
      const startOffset = parseInt(start, 10);
      return NextResponse.json({
        app_name: appName,
        build_number: buildNum,
        start: startOffset,
        logs: '',
        next_start: startOffset,
        more: true, // signal that the build hasn't produced output yet
        pending: true,
      });
    }

    logError("[API] Error getting build logs", error);

    // Jenkins connection/timeout errors are transient — return an empty pending
    // response so the client retries silently instead of showing an error toast.
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTransient = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|socket hang up/i.test(errorMsg);
    if (isTransient) {
      const buildNum = parseInt(buildNumber || '0', 10);
      const startOffset = parseInt(start, 10);
      return NextResponse.json({
        app_name: appName,
        build_number: buildNum,
        start: startOffset,
        logs: '',
        next_start: startOffset,
        more: true,
        pending: true,
      });
    }

    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
