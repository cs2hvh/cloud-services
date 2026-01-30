/**
 * Shared utilities for pipeline generation
 * 
 * PLATFORM DEPLOYMENT CONTRACT:
 * 1. Build stage - builds the container image
 * 2. Create Environment Secret stage - creates/updates K8s secret
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
 * Generate Kubernetes Secret YAML for environment variables
 * Secrets are base64 encoded automatically by Kubernetes when using stringData
 * 
 * @param appName - The application name (used for secret naming)
 * @param envVars - User-defined environment variables
 * @returns Object with secretYaml, secretName, and hasSecret flag
 */
export function generateEnvSecret(
  appName: string,
  envVars: EnvVar[]
): { secretYaml: string; secretName: string; hasSecret: boolean } {
  const secretName = `${appName}-env-secret`;
  
  if (!envVars || envVars.length === 0) {
    return { secretYaml: '', secretName, hasSecret: false };
  }
  
  // Generate stringData entries (Kubernetes will base64 encode automatically)
  const stringDataEntries = envVars.map(env => {
    // Escape special characters for YAML
    // Single quotes in YAML need to be escaped as ''
    const escapedValue = env.value.replace(/'/g, "''");
    return `  ${env.key}: '${escapedValue}'`;
  }).join('\n');
  
  const secretYaml = `apiVersion: v1
kind: Secret
metadata:
  name: ${secretName}
  namespace: default
type: Opaque
stringData:
${stringDataEntries}`;
  
  return { secretYaml, secretName, hasSecret: true };
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
