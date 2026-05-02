/**
 * Kubernetes Custom Domain Service
 * Handles adding/removing custom domains to Ingress resources via Jenkins
 */
import jenkins from "@/lib/jenkins";
import { APP_DOMAIN } from "@/config/domain";
import { createHash } from "crypto";

class JenkinsBuildTerminalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JenkinsBuildTerminalError";
  }
}

export class KubernetesCustomDomainService {
  private static clusterDnsBootstrapPromise: Promise<void> | null = null;

  private static shouldAutoEnsureClusterDns(): boolean {
    // Keep disabled by default to avoid blocking domain activation in clusters
    // where this bootstrap job is not yet permitted/configured.
    const raw = (process.env.DOMAINS_AUTO_FIX_COREDNS ?? "false").trim().toLowerCase();
    return raw !== "false" && raw !== "0" && raw !== "no";
  }

  private static async ensureClusterDnsBootstrapped(): Promise<void> {
    if (!this.shouldAutoEnsureClusterDns()) return;

    if (!this.clusterDnsBootstrapPromise) {
      const bootstrapPromise = this.ensureClusterDns();
      const trackedPromise = bootstrapPromise.catch((error) => {
        // Keep a short cooldown before clearing so overlapping callers don't
        // stomp each other's in-flight state.
        setTimeout(() => {
          if (this.clusterDnsBootstrapPromise === trackedPromise) {
            this.clusterDnsBootstrapPromise = null;
          }
        }, 5_000);
        throw error;
      });
      this.clusterDnsBootstrapPromise = trackedPromise;
    }

    await this.clusterDnsBootstrapPromise;
  }

  /**
   * Add a custom domain to an app's Ingress
   * Creates additional TLS host and rule for the custom domain
   */
  private static getCertIssuer(): string {
    return (process.env.DOMAINS_CERT_ISSUER ?? "letsencrypt-prod").trim();
  }

  private static normalizeNameSegment(value: string): string {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    return normalized || "x";
  }

  private static composeNameWithTail(stem: string, tail: string, maxLength: number): string {
    const safeStem = this.normalizeNameSegment(stem);
    const safeTail = this.normalizeNameSegment(tail);
    const candidate = `${safeStem}-${safeTail}`;
    if (candidate.length <= maxLength) {
      return candidate;
    }

    const stemBudget = Math.max(1, maxLength - safeTail.length - 1);
    const trimmedStem = safeStem.slice(0, stemBudget).replace(/-+$/g, "") || "x";
    return `${trimmedStem}-${safeTail}`;
  }

  private static buildDomainIdentity(customDomain: string): { slug: string; hash: string } {
    return {
      slug: this.normalizeNameSegment(customDomain.replace(/\./g, "-")),
      hash: createHash("sha256").update(customDomain).digest("hex").slice(0, 10),
    };
  }

  private static buildDomainResourceNames(
    appName: string,
    customDomain: string
  ): { certSecretName: string; certName: string } {
    const app = this.normalizeNameSegment(appName);
    const { slug, hash } = this.buildDomainIdentity(customDomain);

    const certSecretName = this.composeNameWithTail(
      `${app}-custom-${slug}`,
      `${hash}-tls`,
      63
    );
    const certName = this.composeNameWithTail(
      `${app}-custom-cert-${slug}`,
      hash,
      63
    );

    return { certSecretName, certName };
  }

  private static buildDomainJobName(
    appName: string,
    action: "add-domain" | "remove-domain",
    customDomain: string
  ): string {
    const app = this.normalizeNameSegment(appName);
    const { slug, hash } = this.buildDomainIdentity(customDomain);
    return this.composeNameWithTail(
      `${app}-${action}-${slug}`,
      `${hash}-job`,
      96
    );
  }

  private static validateInputs(appName: string, customDomain: string): void {
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(appName)) {
      throw new Error(`Invalid appName "${appName}": must be lowercase alphanumeric with hyphens`);
    }
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(customDomain)) {
      throw new Error(`Invalid customDomain "${customDomain}"`);
    }
  }

  static async addCustomDomainToIngress(appName: string, customDomain: string): Promise<void> {
    this.validateInputs(appName, customDomain);
    const jobName = this.buildDomainJobName(appName, "add-domain", customDomain);
    const context = { action: "add-domain", appName, customDomain, jobName } as const;
    console.log("[K8sCustomDomain] Start add domain", context);
    
    const pipeline = this.createAddDomainPipeline(appName, customDomain);
    
    try {
      // One-time (idempotent) cluster bootstrap to avoid cert-manager HTTP-01
      // failures caused by CoreDNS forwarding to private VPC resolvers.
      // This is best-effort and must never block domain activation.
      try {
        await this.ensureClusterDnsBootstrapped();
      } catch (bootstrapError) {
        console.warn(
          "[K8sCustomDomain] CoreDNS bootstrap failed (continuing with activation)",
          {
            ...context,
            error: bootstrapError instanceof Error ? bootstrapError.message : "Unknown error",
          }
        );
      }

      // Upsert job config (safer than delete+create; avoids create races).
      await this.ensureJobConfigured(jobName, pipeline);
      console.log("[K8sCustomDomain] Jenkins job configured", context);
      
      // Trigger the build
      const buildNumber = await this.triggerJobAndResolveBuildNumber(jobName);
      const monitorUrl = this.getSafeMonitorUrl(jobName, buildNumber);
      
      console.log("[K8sCustomDomain] Build triggered", {
        ...context,
        buildNumber,
        monitorUrl,
      });
      
      // Wait for build to complete (with timeout)
      await this.waitForBuildCompletion(jobName, buildNumber, 120000); // 2 minute timeout

      console.log("[K8sCustomDomain] Add domain completed", {
        ...context,
        buildNumber,
      });

      // Self-cleanup: delete the Jenkins job now that it has served its purpose.
      // Best-effort — never fail the overall operation just because cleanup fails.
      jenkins.job.destroy(jobName).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[K8sCustomDomain] Could not delete add-domain job after completion: ${msg}`, { jobName });
      });

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error("[K8sCustomDomain] Add domain failed", {
        ...context,
        error: errorMessage,
      });
      
      throw new Error(`Domain activation execution failed: ${errorMessage}`);
    }
  }

  /**
   * Remove a custom domain from an app's Ingress
   */
  static async removeCustomDomainFromIngress(appName: string, customDomain: string): Promise<void> {
    this.validateInputs(appName, customDomain);
    const jobName = this.buildDomainJobName(appName, "remove-domain", customDomain);
    const context = { action: "remove-domain", appName, customDomain, jobName } as const;
    console.log("[K8sCustomDomain] Start remove domain", context);
    
    const pipeline = this.createRemoveDomainPipeline(appName, customDomain);
    
    try {
      // Upsert job config (safer than delete+create; avoids create races).
      await this.ensureJobConfigured(jobName, pipeline);
      
      // Trigger the build
      const buildNumber = await this.triggerJobAndResolveBuildNumber(jobName);
      const monitorUrl = this.getSafeMonitorUrl(jobName, buildNumber);
      
      console.log("[K8sCustomDomain] Build triggered", {
        ...context,
        buildNumber,
        monitorUrl,
      });
      
      // Wait for build to complete
      await this.waitForBuildCompletion(jobName, buildNumber, 60000); // 1 minute timeout

      console.log("[K8sCustomDomain] Remove domain completed", {
        ...context,
        buildNumber,
      });

      // Self-cleanup: delete the Jenkins job now that it has served its purpose.
      // Best-effort — never fail the overall operation just because cleanup fails.
      jenkins.job.destroy(jobName).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[K8sCustomDomain] Could not delete remove-domain job after completion: ${msg}`, { jobName });
      });

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error("[K8sCustomDomain] Remove domain failed", {
        ...context,
        error: errorMessage,
      });

      throw new Error(`Domain removal execution failed: ${errorMessage}`);
    }
  }

  /**
   * Delete the Jenkins job associated with a domain operation if it still exists.
   * Safe to call even when the job never existed (404 is swallowed).
   * Used during app deletion to clean up any leftover domain jobs.
   */
  static async deleteJobForDomain(
    appName: string,
    action: "add-domain" | "remove-domain",
    customDomain: string
  ): Promise<void> {
    const jobName = this.buildDomainJobName(appName, action, customDomain);
    try {
      await jenkins.job.destroy(jobName);
      console.log(`[K8sCustomDomain] Deleted leftover domain job: ${jobName}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isNotFound =
        msg.includes("404") ||
        msg.toLowerCase().includes("not found") ||
        msg.toLowerCase().includes("does not exist");
      if (!isNotFound) {
        console.warn(`[K8sCustomDomain] Could not delete domain job ${jobName}: ${msg}`);
      }
    }
  }

  /**
   * Wait for Jenkins build to complete
   */
  private static async waitForBuildCompletion(jobName: string, buildNumber: number, timeoutMs: number): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 3000; // 3 seconds
    let lastProgressLogAt = 0;
    const monitorUrl = this.getSafeMonitorUrl(jobName, buildNumber);
    
    while (Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      try {
        const buildInfo = await jenkins.build.get(jobName, buildNumber);
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        if (Date.now() - lastProgressLogAt > 15_000) {
          lastProgressLogAt = Date.now();
          console.log("[K8sCustomDomain] Build progress", {
            jobName,
            buildNumber,
            building: Boolean(buildInfo?.building),
            result: buildInfo?.result ?? null,
            elapsedSec,
            monitorUrl,
          });
        }
        
        if (buildInfo && !buildInfo.building) {
          if (buildInfo.result === 'SUCCESS') {
            console.log("[K8sCustomDomain] Build completed successfully", {
              jobName,
              buildNumber,
              durationMs: buildInfo.duration ?? null,
              monitorUrl,
            });
            return;
          } else if (buildInfo.result === 'FAILURE' || buildInfo.result === 'ABORTED') {
            const logTail = await this.getBuildLogTail(jobName, buildNumber, 120);
            if (logTail) {
              console.error("[K8sCustomDomain] Jenkins build log tail", {
                jobName,
                buildNumber,
                result: buildInfo.result,
                monitorUrl,
                logTail,
              });
            }
            throw new JenkinsBuildTerminalError(
              `Jenkins build failed with result: ${buildInfo.result}. Monitor: ${monitorUrl}`
            );
          }
        }
      } catch (error: unknown) {
        // Rethrow terminal failures and connection errors immediately.
        // Swallow only transient 404-type "build not available yet" errors.
        if (error instanceof JenkinsBuildTerminalError) {
          throw error;
        }
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        if (
          errorMessage.includes("ECONNREFUSED") ||
          errorMessage.includes("ENOTFOUND")
        ) {
          throw error;
        }
      }
    }
    
    const timeoutLogTail = await this.getBuildLogTail(jobName, buildNumber, 120);
    if (timeoutLogTail) {
      console.error("[K8sCustomDomain] Jenkins build log tail (timeout)", {
        jobName,
        buildNumber,
        monitorUrl,
        logTail: timeoutLogTail,
      });
    }
    throw new Error(
      `Timeout waiting for Jenkins build to complete (${jobName}#${buildNumber}). Monitor: ${monitorUrl}`
    );
  }

  /**
   * One-time cluster bootstrap: ensure CoreDNS uses public DNS resolvers.
   *
   * cert-manager's HTTP-01 self-check resolves challenge domains through
   * CoreDNS. If CoreDNS is configured to forward to /etc/resolv.conf (a
   * private VPC resolver), external hostnames cannot be resolved and every
   * ACME challenge hangs forever.
   *
   * This must be run once when a new cluster is provisioned, NOT on every
   * domain activation — patching the CoreDNS configmap is a cluster-wide
   * operation and running it concurrently from multiple per-domain jobs
   * risks races on the configmap and unnecessary CoreDNS restarts.
   */
  static async runClusterDnsBootstrap(): Promise<void> {
    await this.ensureClusterDns();
  }

  private static async ensureClusterDns(): Promise<void> {
    const jobName = "cluster-coredns-public-dns";
    const pipeline = this.createClusterDnsPipeline();

    try {
      await this.ensureJobConfigured(jobName, pipeline);
      const buildNumber = await this.triggerJobAndResolveBuildNumber(jobName);
      console.log("[K8sCustomDomain] CoreDNS bootstrap build triggered", {
        jobName,
        buildNumber,
        monitorUrl: this.getSafeMonitorUrl(jobName, buildNumber),
      });
      await this.waitForBuildCompletion(jobName, buildNumber, 120_000);
    } finally {
      try {
        await jenkins.job.destroy(jobName);
      } catch {
        // ignore cleanup errors
      }
    }
  }

  private static createClusterDnsPipeline(): string {
    return `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>One-time cluster bootstrap: patch CoreDNS to use public DNS resolvers</description>
  <keepDependencies>false</keepDependencies>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps@2.94">
    <script>
<![CDATA[
pipeline {
  agent {
    kubernetes {
      inheritFrom 'common-agent'
      podRetention never()
      activeDeadlineSeconds 180
    }
  }

  options {
    disableConcurrentBuilds()
  }

  environment {
    KUBECONFIG = credentials('kubeconfig_file')
  }

  stages {
    stage('Ensure CoreDNS Uses Public DNS') {
      steps {
        container('kubectl') {
          sh '''
            CURRENT_COREFILE=$(kubectl get configmap coredns -n kube-system \\
              -o jsonpath='{.data.Corefile}' 2>/dev/null || true)

            if [ -z "$CURRENT_COREFILE" ]; then
              echo "Failed to read CoreDNS Corefile from kube-system/coredns configmap."
              exit 1
            fi

            # Check for the desired resolver order (Cloudflare first).
            if echo "$CURRENT_COREFILE" | grep -Fq 'forward . 1.1.1.1 9.9.9.9 8.8.8.8'; then
              echo "CoreDNS already configured with Cloudflare-first DNS resolvers — no change needed"
              exit 0
            fi

            UPDATED_COREFILE=$(printf "%s\\n" "$CURRENT_COREFILE" | awk '
              BEGIN { inRoot=0; depth=0; replaced=0 }
              /^[.]:53[[:space:]]*[{]/ {
                inRoot=1
                depth=1
                print
                next
              }
              {
                line = $0
                if (inRoot && line ~ /^[[:space:]]*forward[[:space:]]+[.]/ && replaced==0) {
                  hasBrace = (line ~ /[{]/) ? " {" : ""
                  line = "    forward . 1.1.1.1 9.9.9.9 8.8.8.8" hasBrace
                  replaced=1
                }
                print line
                if (inRoot) {
                  opens = gsub(/[{]/, "{", line)
                  closes = gsub(/[}]/, "}", line)
                  depth += opens - closes
                  if (depth <= 0) {
                    inRoot=0
                    depth=0
                  }
                }
              }
              END { if (replaced==0) exit 3 }
            ')
            AWK_STATUS=$?

            if [ $AWK_STATUS -eq 3 ]; then
              echo "Could not find a forward stanza inside the .:53 CoreDNS block; manual review required."
              exit 1
            fi
            if [ $AWK_STATUS -ne 0 ]; then
              echo "Failed to render updated CoreDNS Corefile."
              exit 1
            fi

            TMP_COREFILE=$(mktemp)
            printf "%s\\n" "$UPDATED_COREFILE" > "$TMP_COREFILE"

            kubectl create configmap coredns -n kube-system --from-file=Corefile="$TMP_COREFILE" \\
              -o yaml --dry-run=client | kubectl apply -f -
            rm -f "$TMP_COREFILE"

            kubectl rollout restart deployment/coredns -n kube-system
            kubectl rollout status deployment/coredns -n kube-system --timeout=90s
            echo "CoreDNS updated to use public DNS resolvers (8.8.8.8, 8.8.4.4, 1.1.1.1)"
          '''
        }
      }
    }
  }
}
]]>
    </script>
    <sandbox>true</sandbox>
  </definition>
</flow-definition>`;
  }

  private static getSafeJenkinsBaseUrl(): string {
    try {
      const raw = process.env.JENKINS_URL ?? "";
      if (!raw) return "";
      const parsed = new URL(raw);
      parsed.username = "";
      parsed.password = "";
      return parsed.toString();
    } catch {
      return "";
    }
  }

  private static getSafeMonitorUrl(jobName: string, buildNumber?: number): string {
    const base = this.getSafeJenkinsBaseUrl();
    if (!base) return "";
    const suffix = buildNumber ? `/${buildNumber}` : "";
    return `${base}/job/${jobName}${suffix}/`;
  }

  private static async getLatestBuildNumber(jobName: string): Promise<number | null> {
    try {
      const jobInfo = await jenkins.job.get(jobName);
      const n = jobInfo?.lastBuild?.number;
      return typeof n === "number" ? n : null;
    } catch {
      return null;
    }
  }

  private static async triggerJobAndResolveBuildNumber(jobName: string): Promise<number> {
    const previousLastBuild = await this.getLatestBuildNumber(jobName);
    await jenkins.job.build(jobName);

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const currentLastBuild = await this.getLatestBuildNumber(jobName);
      if (typeof currentLastBuild === "number") {
        if (previousLastBuild == null || currentLastBuild > previousLastBuild) {
          return currentLastBuild;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`Build was triggered but no new build number appeared for job ${jobName} within 30s`);
  }

  private static async getBuildLogTail(
    jobName: string,
    buildNumber: number,
    maxLines: number
  ): Promise<string | null> {
    try {
      const raw = await jenkins.build.log(jobName, buildNumber, { type: "text" });
      if (typeof raw !== "string" || raw.length === 0) return null;
      const sanitized = sanitizeJenkinsLog(raw);
      const lines = sanitized.split("\n");
      return lines.slice(-maxLines).join("\n");
    } catch {
      return null;
    }
  }

  private static async ensureJobConfigured(jobName: string, pipeline: string): Promise<void> {
    // 1) Prefer updating existing config (safer, avoids create races).
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await jenkins.job.config(jobName, pipeline);
        if (attempt > 1) {
          console.log("[K8sCustomDomain] Jenkins job config updated after retry", { jobName, attempt });
        }
        return;
      } catch (error) {
        const message = toErrorMessage(error);
        if (this.isNotFoundError(message)) {
          break;
        }
        if (attempt < 3) {
          await sleep(attempt * 500);
          continue;
        }
        throw new Error(`Failed to update job ${jobName}: ${message}`);
      }
    }

    // 2) Create if missing.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await jenkins.job.create(jobName, pipeline);
        if (attempt > 1) {
          console.log("[K8sCustomDomain] Jenkins job created after retry", { jobName, attempt });
        }
        return;
      } catch (createError) {
        const createMessage = toErrorMessage(createError);

        // Race-safe fallback: if job now exists, try final config update.
        if (await this.jobExists(jobName)) {
          try {
            await jenkins.job.config(jobName, pipeline);
            return;
          } catch (configError) {
            const configMessage = toErrorMessage(configError);
            throw new Error(
              `Failed to configure Jenkins job ${jobName} after create race: ${configMessage}`
            );
          }
        }

        if (attempt < 3) {
          await sleep(attempt * 700);
          continue;
        }

        throw new Error(`Failed to create Jenkins job ${jobName}: ${createMessage}`);
      }
    }
  }

  private static async jobExists(jobName: string): Promise<boolean> {
    try {
      await jenkins.job.get(jobName);
      return true;
    } catch {
      return false;
    }
  }

  private static isNotFoundError(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      message.includes("404")
      || lower.includes("not found")
      || lower.includes("unknown job")
      || lower.includes("does not exist")
      || lower.includes("no such job")
    );
  }

  /**
   * Create Jenkins pipeline for adding custom domain to Ingress
   * This properly merges with existing TLS/rules to support multiple domains
   */
  private static createAddDomainPipeline(appName: string, customDomain: string): string {
    const serviceName = `${appName}-service`;
    const { certSecretName, certName } = this.buildDomainResourceNames(appName, customDomain);
    const platformDomain = `${appName}.${APP_DOMAIN}`;
    const certIssuer = this.getCertIssuer();
    
    return `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>Add custom domain ${customDomain} to ${appName}</description>
  <keepDependencies>false</keepDependencies>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps@2.94">
    <script>
<![CDATA[
pipeline {
  agent {
    kubernetes {
      inheritFrom 'common-agent'
      podRetention never()
      activeDeadlineSeconds 300
    }
  }

  options {
    disableConcurrentBuilds()
  }

  environment {
    KUBECONFIG = credentials('kubeconfig_file')
    APP_NAME = '${appName}'
    CUSTOM_DOMAIN = '${customDomain}'
    SERVICE_NAME = '${serviceName}'
    CERT_SECRET = '${certSecretName}'
    CERT_NAME = '${certName}'
    CERT_ISSUER = '${certIssuer}'
    PLATFORM_DOMAIN = '${platformDomain}'
  }

  stages {
    stage('Add Custom Domain') {
      steps {
        container('kubectl') {
          script {
            echo "Adding custom domain \${CUSTOM_DOMAIN} to app \${APP_NAME}"

            // Step 1: Patch ingress FIRST so the ACME HTTP-01 challenge route exists
            //         before cert-manager ever attempts to verify domain ownership.
            sh '''
              INGRESS_NAME="${appName}-ingress"
              if ! kubectl get ingress \${INGRESS_NAME} >/dev/null 2>&1; then
                echo "Ingress \${INGRESS_NAME} not found."
                exit 1
              fi

              EXISTING_RULE_HOSTS=$(kubectl get ingress \${INGRESS_NAME} -o jsonpath='{.spec.rules[*].host}' 2>/dev/null || true)
              EXISTING_TLS_HOSTS=$(kubectl get ingress \${INGRESS_NAME} -o jsonpath='{.spec.tls[*].hosts[*]}' 2>/dev/null || true)

              if echo " \${EXISTING_RULE_HOSTS} " | grep -qw "\${CUSTOM_DOMAIN}"; then
                echo "Ingress rule already contains \${CUSTOM_DOMAIN} (skip)"
              else
                cat > patch-rules-append.json <<PATCH_EOF
[
  {
    "op": "add",
    "path": "/spec/rules/-",
    "value": {
      "host": "\${CUSTOM_DOMAIN}",
      "http": {
        "paths": [
          {
            "path": "/",
            "pathType": "Prefix",
            "backend": {
              "service": {
                "name": "\${SERVICE_NAME}",
                "port": { "number": 80 }
              }
            }
          }
        ]
      }
    }
  }
]
PATCH_EOF

                cat > patch-rules-init.json <<PATCH_EOF
[
  {
    "op": "add",
    "path": "/spec/rules",
    "value": [
      {
        "host": "\${CUSTOM_DOMAIN}",
        "http": {
          "paths": [
            {
              "path": "/",
              "pathType": "Prefix",
              "backend": {
                "service": {
                  "name": "\${SERVICE_NAME}",
                  "port": { "number": 80 }
                }
              }
            }
          ]
        }
      }
    ]
  }
]
PATCH_EOF

                kubectl patch ingress \${INGRESS_NAME} --type='json' --patch-file patch-rules-append.json || \
                kubectl patch ingress \${INGRESS_NAME} --type='json' --patch-file patch-rules-init.json
              fi

              if echo " \${EXISTING_TLS_HOSTS} " | grep -qw "\${CUSTOM_DOMAIN}"; then
                echo "Ingress TLS already contains \${CUSTOM_DOMAIN} (skip)"
              else
                cat > patch-tls-append.json <<PATCH_EOF
[
  {
    "op": "add",
    "path": "/spec/tls/-",
    "value": {
      "hosts": ["\${CUSTOM_DOMAIN}"],
      "secretName": "\${CERT_SECRET}"
    }
  }
]
PATCH_EOF

                cat > patch-tls-init.json <<PATCH_EOF
[
  {
    "op": "add",
    "path": "/spec/tls",
    "value": [
      {
        "hosts": ["\${CUSTOM_DOMAIN}"],
        "secretName": "\${CERT_SECRET}"
      }
    ]
  }
]
PATCH_EOF

                kubectl patch ingress \${INGRESS_NAME} --type='json' --patch-file patch-tls-append.json || \
                kubectl patch ingress \${INGRESS_NAME} --type='json' --patch-file patch-tls-init.json
              fi

              echo "Ingress updated to include custom domain \${CUSTOM_DOMAIN}"

              # Verify the change - show all hosts
              echo "Current Ingress hosts:"
              kubectl get ingress \${INGRESS_NAME} -o jsonpath='{.spec.rules[*].host}' | tr ' ' '\\n'
            '''

            // Step 2: Reuse existing cert if valid, otherwise apply and let cert-manager issue.
            // Never force-delete CertificateRequests/Orders — that triggers immediate re-issuance
            // and burns rate-limit quota. cert-manager will retry on its own schedule.
            sh '''
              # If the TLS secret already exists and holds a valid cert for this domain, reuse it.
              SECRET_EXISTS=$(kubectl get secret \${CERT_SECRET} -n default --ignore-not-found=true -o name 2>/dev/null || true)
              if [ -n "$SECRET_EXISTS" ]; then
                CERT_DATA=$(kubectl get secret \${CERT_SECRET} -n default -o jsonpath='{.data.tls\.crt}' 2>/dev/null | base64 -d 2>/dev/null || true)
                if [ -z "$CERT_DATA" ]; then
                  echo "⚠️ TLS secret exists but contains no cert data — reissuing"
                else
                  # Strictly validate cert hostname coverage (SAN/CN + wildcard support).
                  # A secret left over from another domain must never be reused.
                  CERT_SUBJECT=$(echo "$CERT_DATA" | openssl x509 -noout -subject 2>/dev/null || true)
                  if ! echo "$CERT_DATA" | openssl x509 -noout -checkhost "\${CUSTOM_DOMAIN}" >/dev/null 2>&1; then
                    echo "⚠️ Cert hostname mismatch (\${CERT_SUBJECT:-subject unavailable}) — reissuing for \${CUSTOM_DOMAIN}"
                  else
                    EXPIRY=$(echo "$CERT_DATA" | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)
                    if [ -n "$EXPIRY" ]; then
                      EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s 2>/dev/null || date -jf "%b %e %H:%M:%S %Y %Z" "$EXPIRY" +%s 2>/dev/null || echo 0)
                      NOW_EPOCH=$(date +%s)
                      DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
                      if [ $DAYS_LEFT -gt 30 ]; then
                        echo "✅ Valid TLS secret already exists (expires in \${DAYS_LEFT} days) — skipping certificate issuance"
                        exit 0
                      else
                        echo "⚠️ Existing cert expires in \${DAYS_LEFT} days — applying renewal"
                      fi
                    fi
                  fi
                fi
              fi

              cat > custom-cert.yaml << CERT_EOF
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: \${CERT_NAME}
  namespace: default
spec:
  secretName: \${CERT_SECRET}
  issuerRef:
    name: \${CERT_ISSUER}
    kind: ClusterIssuer
  dnsNames:
  - \${CUSTOM_DOMAIN}
CERT_EOF
              kubectl apply -f custom-cert.yaml

              CERT_READY=$(kubectl get certificate \${CERT_NAME} -n default \
                -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "Unknown")
              CERT_REASON=$(kubectl get certificate \${CERT_NAME} -n default \
                -o jsonpath='{.status.conditions[?(@.type=="Ready")].reason}' 2>/dev/null || echo "")
              CERT_MSG=$(kubectl get certificate \${CERT_NAME} -n default \
                -o jsonpath='{.status.conditions[?(@.type=="Ready")].message}' 2>/dev/null || echo "")

              if [ "$CERT_READY" = "True" ]; then
                echo "✅ Secure connection material is ready"
              elif echo "$CERT_MSG" | grep -Eqi "ratelimited|too many certificates|last 168h"; then
                echo "⚠️ Provider rate limit reached for this domain. Wait for the retry-after time before re-activating."
              elif [ "$CERT_READY" = "False" ]; then
                echo "⚠️ Secure connection setup is in a failed state (\${CERT_REASON})."
                echo "   Keep resources unchanged to avoid forced retry loops. Re-activate after root cause is fixed."
              else
                echo "ℹ️ Secure connection setup is still in progress."
              fi
            '''
          }
        }
      }
    }

    stage('Report SSL Status') {
      steps {
        container('kubectl') {
          script {
            sh '''
              CERT_READY=$(kubectl get certificate \${CERT_NAME} -n default \
                -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || echo "Unknown")
              CERT_MSG=$(kubectl get certificate \${CERT_NAME} -n default \
                -o jsonpath='{.status.conditions[?(@.type=="Ready")].message}' 2>/dev/null || echo "")

              echo "SSL state: $CERT_READY — $CERT_MSG"

              if [ "$CERT_READY" = "True" ]; then
                echo "✅ SSL certificate is ready!"
              else
                echo "ℹ️  cert-manager is issuing certificate for \${CUSTOM_DOMAIN}"
                echo "    This normally takes 2–5 minutes for HTTP-01 challenges."
                kubectl get certificaterequest -n default \
                  -l cert-manager.io/certificate-name=\${CERT_NAME} 2>/dev/null || true
                kubectl get challenge -n default 2>/dev/null | grep "\${CUSTOM_DOMAIN}" || true
              fi
            '''
          }
        }
      }
    }
  }
  
  post {
    success {
      echo "✅ Custom domain ${customDomain} successfully added to ${appName}"
    }
    failure {
      echo "❌ Failed to add custom domain ${customDomain} to ${appName}"
    }
  }
}
]]>
    </script>
    <sandbox>true</sandbox>
  </definition>
</flow-definition>`;
  }

  /**
   * Create Jenkins pipeline for removing custom domain from Ingress
   */
  private static createRemoveDomainPipeline(appName: string, customDomain: string): string {
    const platformDomain = `${appName}.${APP_DOMAIN}`;
    const { certSecretName, certName } = this.buildDomainResourceNames(appName, customDomain);
    
    return `<?xml version='1.0' encoding='UTF-8'?>
<flow-definition plugin="workflow-job@2.44">
  <actions/>
  <description>Remove custom domain ${customDomain} from ${appName}</description>
  <keepDependencies>false</keepDependencies>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps@2.94">
    <script>
<![CDATA[
pipeline {
  agent {
    kubernetes {
      inheritFrom 'common-agent'
      podRetention never()
      activeDeadlineSeconds 180
    }
  }

  options {
    disableConcurrentBuilds()
  }

  environment {
    KUBECONFIG = credentials('kubeconfig_file')
    APP_NAME = '${appName}'
    CUSTOM_DOMAIN = '${customDomain}'
    SERVICE_NAME = '${appName}-service'
    PLATFORM_DOMAIN = '${platformDomain}'
    CERT_SECRET = '${certSecretName}'
    CERT_NAME = '${certName}'
  }

  stages {
    stage('Remove Custom Domain') {
      steps {
        container('kubectl') {
          script {
            echo "Removing custom domain \${CUSTOM_DOMAIN} from app \${APP_NAME}"
            
            // Remove only the target domain while preserving others (using jq)
            sh '''
              INGRESS_NAME="${appName}-ingress"
              DOMAIN_TO_REMOVE="${customDomain}"
              
              # Get current ingress as JSON
              kubectl get ingress \${INGRESS_NAME} -o json > current-ingress.json
              
              # Use jq to filter out the target domain from TLS and rules
              # Handle null arrays with // [] to prevent "Cannot iterate over null" error
              jq --arg domain "\${DOMAIN_TO_REMOVE}" '
                .spec.tls = [(.spec.tls // [])[] | select(.hosts | index(\$domain) | not)] |
                .spec.rules = [(.spec.rules // [])[] | select(.host != \$domain)]
              ' current-ingress.json > filtered-ingress.json
              
              echo "Patching ingress to remove \${DOMAIN_TO_REMOVE}..."
              kubectl apply -f filtered-ingress.json
              
              echo "Remaining hosts after removal:"
              kubectl get ingress \${INGRESS_NAME} -o jsonpath='{.spec.rules[*].host}' | tr ' ' '\\n'
            '''
            
            // Delete the certificate CRD so cert-manager stops renewing it.
            // Intentionally preserve the TLS secret — if the domain is re-added later
            // the existing cert will be reused without issuing a new one from Let's Encrypt.
            sh '''
              kubectl delete certificate \${CERT_NAME} --ignore-not-found=true
              echo "Certificate CRD removed (TLS secret preserved for reuse)"
            '''
          }
        }
      }
    }
  }
  
  post {
    success {
      echo "✅ Custom domain ${customDomain} successfully removed from ${appName}"
    }
    failure {
      echo "❌ Failed to remove custom domain ${customDomain} from ${appName}"
    }
  }
}
]]>
    </script>
    <sandbox>true</sandbox>
  </definition>
</flow-definition>`;
  }
}

function sanitizeJenkinsLog(input: string): string {
  // Remove concealed ANSI chunks and control sequences from Jenkins log output.
  const withoutConcealed = input.replace(/\u001b\[8m[\s\S]*?\u001b\[0m/g, "");
  const withoutAnsi = withoutConcealed.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "");
  return withoutAnsi.replace(/\r\n/g, "\n").trim();
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
