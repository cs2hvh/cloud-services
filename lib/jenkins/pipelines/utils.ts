/**
 * Shared utilities for pipeline generation
 * 
 * PLATFORM DEPLOYMENT CONTRACT:
 * 1. Build stage - builds the container image
 * 2. Runtime secret sync is handled by backend API/Kubernetes service (NOT Jenkins templates)
 * 3. Deploy to Kubernetes stage - deploys the application
 * 
 * All pipelines MUST follow this order. No exceptions.
 */

export interface EnvVar {
  key: string;
  value: string;
}

/**
 * Supported runtime types for default environment variables
 */
export type Runtime = 'node' | 'python' | 'java';

/**
 * Generate runtime secret metadata for deployment manifests.
 * Secret values are intentionally not embedded in Jenkins pipeline XML.
 * 
 * @param appName - The application name (used for secret naming)
 * @param envVars - User-defined environment variables (used only to detect whether runtime secret ref is needed)
 * @returns Secret reference metadata and whether Jenkins should create the secret (always false)
 */
export function generateEnvSecret(
  appName: string,
  envVars: EnvVar[]
): { secretYaml: string; secretName: string; hasSecret: boolean; createInPipeline: boolean } {
  const secretName = `${appName}-env-secret`;
  
  if (!envVars || envVars.length === 0) {
    return { secretYaml: '', secretName, hasSecret: false, createInPipeline: false };
  }

  // Runtime values are synced by backend (KubernetesInfoService) before deployment.
  // Keep Jenkins pipeline XML free of secret values.
  return { secretYaml: '', secretName, hasSecret: true, createInPipeline: false };
}

/**
 * Generate the envFrom section for Kubernetes deployment
 * References the secret created by generateEnvSecret
 * 
 * This MUST be included in every deployment when hasSecret is true
 */
export function generateEnvFromSection(secretName: string, hasSecret: boolean): string {
  if (!hasSecret) {
    return '';
  }
  
  return `        envFrom:
        - secretRef:
            name: ${secretName}`;
}

/**
 * Generate runtime-specific default environment variables
 * 
 * This is the SINGLE entry point for all runtime defaults.
 * All pipelines MUST use this function.
 * 
 * @param runtime - The runtime type ('node' | 'python' | 'java')
 * @param containerPort - The container port (defaults based on runtime if not specified)
 */
export function generateRuntimeDefaultEnvYaml(
  runtime: Runtime,
  containerPort?: number | string
): string {
  if (runtime === 'python') {
    const port = containerPort ?? 8000;
    return `        env:
        - name: PORT
          value: "${port}"
        - name: PYTHONUNBUFFERED
          value: "1"
        - name: PYTHONDONTWRITEBYTECODE
          value: "1"`;
  }

  if (runtime === 'java') {
    const port = containerPort ?? 8080;
    return `        env:
        - name: PORT
          value: "${port}"
        - name: JAVA_OPTS
          value: "-Xmx512m -Xms256m"`;
  }

  // node + frontend default (node, express, nextjs, nuxtjs, vite-react, vue, angular, sveltekit)
  const port = containerPort ?? 3000;
  return `        env:
        - name: PORT
          value: "${port}"
        - name: NODE_ENV
          value: "production"`;
}

// =============================================================================
// DEPRECATED FUNCTIONS - Keep for backward compatibility during migration
// Remove after all pipelines are updated
// =============================================================================

/**
 * @deprecated Use generateRuntimeDefaultEnvYaml('node', containerPort) instead
 */
export function generateDefaultEnvYaml(containerPort: number | string): string {
  return generateRuntimeDefaultEnvYaml('node', containerPort);
}

/**
 * @deprecated Use generateRuntimeDefaultEnvYaml('python', containerPort) instead
 */
export function generatePythonDefaultEnvYaml(containerPort: number | string): string {
  return generateRuntimeDefaultEnvYaml('python', containerPort);
}

/**
 * @deprecated Use generateEnvSecret + generateEnvFromSection instead
 * This function embeds secrets directly in deployment YAML which is insecure
 */
export function generateEnvYaml(
  containerPort: number | string,
  userEnvVars: EnvVar[] = []
): string {
  const defaultEnvVars: EnvVar[] = [
    { key: 'PORT', value: String(containerPort) },
    { key: 'NODE_ENV', value: 'production' },
  ];
  
  const userKeys = new Set(userEnvVars.map(e => e.key));
  const mergedEnvVars = [
    ...defaultEnvVars.filter(d => !userKeys.has(d.key)),
    ...userEnvVars,
  ];
  
  const envYaml = mergedEnvVars.map(env => {
    const escapedValue = env.value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$');
    return `        - name: ${env.key}
          value: "${escapedValue}"`;
  }).join('\n');
  
  return envYaml;
}

/**
 * @deprecated Use generateEnvSecret + generateEnvFromSection instead
 */
export function generatePythonEnvYaml(
  containerPort: number | string,
  userEnvVars: EnvVar[] = []
): string {
  const defaultEnvVars: EnvVar[] = [
    { key: 'PORT', value: String(containerPort) },
    { key: 'PYTHONUNBUFFERED', value: '1' },
  ];
  
  const userKeys = new Set(userEnvVars.map(e => e.key));
  const mergedEnvVars = [
    ...defaultEnvVars.filter(d => !userKeys.has(d.key)),
    ...userEnvVars,
  ];
  
  const envYaml = mergedEnvVars.map(env => {
    const escapedValue = env.value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$');
    return `        - name: ${env.key}
          value: "${escapedValue}"`;
  }).join('\n');
  
  return envYaml;
}

/**
 * Generate a shell script that applies ingress.yaml while preserving existing
 * custom domain rules added via the platform's domain connections feature.
 *
 * Problem solved: a bare `kubectl apply -f ingress.yaml` on redeploy writes the
 * `last-applied-configuration` annotation with only the platform host, which
 * overwrites any custom-domain host rules previously patched in by the
 * add-domain Jenkins job.
 *
 * Solution: snapshot existing non-platform rules/TLS entries before applying,
 * then immediately re-attach them using `jq` + `kubectl apply`.
 *
 * Requires: `jq` available in the executor container (already used by the
 * remove-domain pipeline).
 *
 * @param ingressName          - Kubernetes ingress resource name (resolved at codegen time)
 * @param platformDomainSuffix - Platform domain suffix that identifies platform-owned hosts
 *                               (e.g. "galaxyhvh.com" → matches "*.galaxyhvh.com")
 */
export function generateSmartIngressApplyScript(ingressName: string, platformDomainSuffix: string): string {
  // Note on escaping inside this TypeScript template literal:
  //   ${ingressName} / ${platformDomainSuffix} → TypeScript interpolation (replaced at codegen time)
  //   $SHELL_VAR / $(cmd)                      → NOT interpolated by TypeScript (no curly braces)
  //   '\\n'                                    → produces literal \n in output (for tr)
  return `              echo 'Applying ingress (preserving custom domain connections)'
              # Snapshot any non-platform (custom) domain rules before the platform manifest overwrites them
              if kubectl get ingress ${ingressName} -n default --ignore-not-found=true -o name 2>/dev/null | grep -q .; then
                kubectl get ingress ${ingressName} -n default -o json > _pre_deploy_ingress.json
                CUSTOM_RULES=$(jq -c '[.spec.rules // [] | .[] | select((.host | endswith(".${platformDomainSuffix}") | not) and .host != "${platformDomainSuffix}")]' _pre_deploy_ingress.json)
                CUSTOM_TLS=$(jq -c '[.spec.tls // [] | .[] | select([(.hosts // [])[] | endswith(".${platformDomainSuffix}")] | any | not)]' _pre_deploy_ingress.json)
                CUSTOM_COUNT=$(echo "$CUSTOM_RULES" | jq 'length')
              else
                CUSTOM_RULES='[]'
                CUSTOM_TLS='[]'
                CUSTOM_COUNT=0
              fi
              kubectl apply -f ingress.yaml || echo "WARNING: ingress webhook timeout, skipping ingress"
              # Restore custom domain rules that were stripped by the platform redeploy
              if [ "$CUSTOM_COUNT" -gt "0" ]; then
                echo "Restoring $CUSTOM_COUNT custom domain rule(s) stripped by redeploy"
                kubectl get ingress ${ingressName} -n default -o json | jq --argjson cr "$CUSTOM_RULES" --argjson ct "$CUSTOM_TLS" '.spec.rules += $cr | .spec.tls += $ct' | kubectl apply -f - || echo "WARNING: custom domain restore failed"
                echo "Active hosts after redeploy:"
                kubectl get ingress ${ingressName} -n default -o jsonpath='{.spec.rules[*].host}' | tr ' ' '\\n'
              fi`;
}
