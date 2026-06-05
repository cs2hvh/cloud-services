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

export interface AppSizeSpec {
  cpuRequest: string;
  cpuLimit: string;
  memoryRequest: string;
  memoryLimit: string;
  replicas: number;
}

// Custom profile spec — admin-assigned explicit resources for enterprise customers.
export type CustomProfileSpec = AppSizeSpec;

const SIZE_ORDER = ['small', 'medium', 'large', 'xlarge', 'xxlarge'] as const;

const APP_SIZE_SPECS: Record<string, AppSizeSpec> = {
  small:   { cpuRequest: '250m', cpuLimit: '500m', memoryRequest: '256Mi', memoryLimit: '512Mi', replicas: 1 },
  medium:  { cpuRequest: '500m', cpuLimit: '1',    memoryRequest: '512Mi', memoryLimit: '1Gi',   replicas: 2 },
  large:   { cpuRequest: '1',    cpuLimit: '2',    memoryRequest: '1Gi',   memoryLimit: '2Gi',   replicas: 3 },
  xlarge:  { cpuRequest: '2',    cpuLimit: '4',    memoryRequest: '2Gi',   memoryLimit: '4Gi',   replicas: 4 },
  'xxlarge': { cpuRequest: '4', cpuLimit: '8',    memoryRequest: '4Gi',   memoryLimit: '8Gi',   replicas: 6 },
};

/**
 * Resolve K8s resource spec for a given app size key.
 * @param sizeKey    - Requested size ('small' | 'medium' | 'large' | 'xlarge' | 'xxlarge')
 * @param minSize    - Floor size — when the requested size ranks below this, the floor is used.
 *                     Use 'medium' for runtimes that need more base resources (JVM, SSR).
 * @param sizeOverride - When set, bypasses the lookup entirely and uses these values directly.
 *                       Used by custom-profile apps where admin sets explicit CPU/RAM/replicas.
 */
export function resolveAppSize(sizeKey: string, minSize: string = 'small', sizeOverride?: Partial<AppSizeSpec>): AppSizeSpec {
  if (sizeOverride) {
    return { ...APP_SIZE_SPECS.small, ...sizeOverride };
  }
  const key = (sizeKey || 'small').toLowerCase();
  const min = (minSize || 'small').toLowerCase();
  const keyIdx = SIZE_ORDER.indexOf(key as typeof SIZE_ORDER[number]);
  const minIdx = SIZE_ORDER.indexOf(min as typeof SIZE_ORDER[number]);
  const effectiveKey = keyIdx >= minIdx ? key : min;
  return APP_SIZE_SPECS[effectiveKey] ?? APP_SIZE_SPECS.small;
}

/**
 * Generate liveness + readiness probe YAML for a K8s container spec.
 *
 * Always uses tcpSocket probes (port-open check). This keeps deployments
 * resilient — a misconfigured healthcheck_path never crashes the pod.
 * The healthcheckPath parameter is accepted but ignored here; it is stored
 * in the database for display and future soft-check use only.
 *
 * @param port               - Container port (TypeScript value, baked into XML at codegen time)
 * @param healthcheckPath    - Stored but not used for K8s probes (reserved for future use)
 * @param options.readinessInitialDelay - Seconds before first readiness check (default 15)
 * @param options.livenessInitialDelay  - Seconds before first liveness check (default 30)
 */
export function generateProbeYaml(
  port: number | string,
  healthcheckPath?: string | null,
  options?: { readinessInitialDelay?: number; livenessInitialDelay?: number },
): string {
  const readinessDelay = options?.readinessInitialDelay ?? 15;
  const livenessDelay  = options?.livenessInitialDelay  ?? 30;

  return `        readinessProbe:
          tcpSocket:
            port: ${port}
          initialDelaySeconds: ${readinessDelay}
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 6
        livenessProbe:
          tcpSocket:
            port: ${port}
          initialDelaySeconds: ${livenessDelay}
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3`;
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

/**
 * Generate the complete 'Build Docker Image' stage using BuildKit instead of Kaniko.
 *
 * BuildKit advantages over Kaniko:
 *  - 60% less memory (1.5 GB vs 4–6 GB per build)
 *  - Better layer caching with registry cache export/import
 *  - Faster builds via parallelised dependency resolution
 *
 * @param appName       - Full app name (e.g. "myapp-app") used for the cache registry ref
 * @param buildOpts     - Zero or more `--opt` flags to append (e.g. build args)
 * @param extraScript   - Optional shell snippet inserted after the buildkitd readiness wait
 *                        (use this to pass a package-manager detection script)
 */
export function generateBuildKitStage(
  appName: string,
  buildOpts: string[] = [],
  extraScript: string = '',
): string {
  const optLines = buildOpts.length > 0
    ? buildOpts.map(o => `                ${o} \\\\`).join('\n') + '\n'
    : '';
  const extraBlock = extraScript
    ? `\n              # Detect runtime tooling before build\n${extraScript}\n`
    : '';

  return `    stage('Build Docker Image') {
      steps {
        container('buildkit') {
          withCredentials([usernamePassword(credentialsId: 'dockerhublogin',
            usernameVariable: 'DOCKER_USER',
            passwordVariable: 'DOCKER_PASS')]) {

            sh '''
              echo "STAGE: Build Docker Image"
              echo "Building image: $DOCKER_IMAGE_VERSION (and tagging latest)"

              BUILDKIT_READY=0
              for i in $(seq 1 30); do
                if buildctl debug workers >/dev/null 2>&1; then
                  BUILDKIT_READY=1
                  break
                fi
                echo "Waiting for buildkitd... ($i/30)"
                sleep 2
              done
              [ "$BUILDKIT_READY" = "1" ] || { echo "ERROR: buildkitd not ready"; cat /tmp/buildkitd.log 2>/dev/null; exit 1; }
              echo "buildkitd ready"
${extraBlock}
              mkdir -p ~/.docker
              AUTH=$(echo -n "$DOCKER_USER:$DOCKER_PASS" | base64)
              cat > ~/.docker/config.json <<CREDSEOF
{
  "auths": {
    "https://index.docker.io/v1/": {
      "auth": "$AUTH"
    }
  }
}
CREDSEOF

              echo "Executing BuildKit build"
              buildctl build \\\\
                --frontend dockerfile.v0 \\\\
                --local context=$WORKSPACE \\\\
                --local dockerfile=$WORKSPACE \\\\
                --output type=image,name=$DOCKER_IMAGE_VERSION,push=true \\\\
                --output type=image,name=$DOCKER_IMAGE_LATEST,push=true \\\\
${optLines}                --export-cache type=registry,ref=hav0ky/${appName}-cache:buildcache,mode=max \\\\
                --import-cache type=registry,ref=hav0ky/${appName}-cache:buildcache \\\\
                --metadata-file buildkit-meta.json

              grep -o '"containerimage.digest":"[^"]*"' buildkit-meta.json 2>/dev/null \\\\
                | head -1 | sed 's/.*"containerimage.digest":"//;s/"//g' > image-digest.txt || true

              echo "Image build completed successfully"
            '''
          }
        }
      }
    }`;
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
