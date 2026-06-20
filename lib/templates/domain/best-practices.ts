import type { EnvValue, TemplateServiceSpec, TemplateSpec } from './spec-schema';
import { getEnvImpliedDeps } from './dag';

export type TemplatePracticeSeverity = 'error' | 'warning';

export type TemplatePracticeIssue = {
  code: string;
  severity: TemplatePracticeSeverity;
  field: string;
  message: string;
};

export type TemplateUpdatePolicy = {
  policy: 'none' | 'github';
  source: {
    repos: Array<{ serviceId: string; repoUrl: string; branch: string; rootDir: string }>;
  };
};

const SECRET_KEY_PATTERN = /(password|passwd|secret|token|api[_-]?key|private[_-]?key|salt|credential)/i;
const STATEFUL_TYPES = new Set(['database', 'cache', 'queue']);

export function evaluateTemplateBestPractices(spec: TemplateSpec): TemplatePracticeIssue[] {
  const issues: TemplatePracticeIssue[] = [];

  for (const [inputKey, input] of Object.entries(spec.inputs ?? {})) {
    if (!input.description?.trim()) {
      issues.push({
        code: 'input_missing_description',
        severity: 'warning',
        field: `inputs.${inputKey}.description`,
        message: 'Template inputs should explain what the deployer needs to provide.',
      });
    }
  }

  for (const service of spec.services) {
    issues.push(...evaluateService(service));
  }

  // Cross-service checks — need full spec context
  issues.push(...evaluateCrossServiceRules(spec));

  return issues;
}

export function getTemplateUpdatePolicy(spec: TemplateSpec): TemplateUpdatePolicy {
  const repos = spec.services.flatMap(service => {
    if (service.source.kind === 'github') {
      return [{
        serviceId: service.id,
        repoUrl: service.source.repoUrl,
        branch: service.source.branch,
        rootDir: service.source.rootDir,
      }];
    }

    if (service.source.kind === 'image' && service.source.builtFrom?.kind === 'github') {
      return [{
        serviceId: service.id,
        repoUrl: service.source.builtFrom.repoUrl,
        branch: service.source.builtFrom.branch,
        rootDir: service.source.builtFrom.rootDir,
      }];
    }

    return [];
  });

  return {
    policy: repos.length > 0 ? 'github' : 'none',
    source: { repos },
  };
}

export function splitPracticeIssues(issues: TemplatePracticeIssue[]) {
  return {
    errors: issues.filter(issue => issue.severity === 'error'),
    warnings: issues.filter(issue => issue.severity === 'warning'),
  };
}

function evaluateService(service: TemplateServiceSpec): TemplatePracticeIssue[] {
  const issues: TemplatePracticeIssue[] = [];

  if (STATEFUL_TYPES.has(service.type) && service.volumes.length === 0) {
    issues.push({
      code: 'stateful_service_missing_volume',
      severity: 'error',
      field: `services.${service.id}.volumes`,
      message: 'Stateful database, cache, and queue services must define persistent storage before publishing.',
    });
  }

  if (service.type === 'web' && hasPublicEndpoint(service) && !service.healthCheck) {
    issues.push({
      code: 'public_web_missing_healthcheck',
      severity: 'warning',
      field: `services.${service.id}.healthCheck`,
      message: 'Public web services should define a readiness or liveness health check.',
    });
  }

  if (STATEFUL_TYPES.has(service.type) && hasPublicEndpoint(service)) {
    issues.push({
      code: 'stateful_service_public_endpoint',
      severity: 'warning',
      field: `services.${service.id}.ports`,
      message: 'Stateful services should prefer private networking; expose public TCP only when users need external access.',
    });
  }

  const authEnv = Object.entries(service.env).filter(([key, value]) =>
    SECRET_KEY_PATTERN.test(key) || value.kind === 'generatedSecret' || value.kind === 'secretRef'
  );
  if (STATEFUL_TYPES.has(service.type) && authEnv.length === 0) {
    issues.push({
      code: 'stateful_service_auth_not_configured',
      severity: 'warning',
      field: `services.${service.id}.env`,
      message: 'Stateful services should configure authentication credentials with generated secrets or secret references.',
    });
  }

  for (const [key, value] of Object.entries(service.env)) {
    if (!hasDescription(value)) {
      issues.push({
        code: 'env_missing_description',
        severity: 'warning',
        field: `services.${service.id}.env.${key}.description`,
        message: 'Environment variables should include descriptions so deployers understand what they do.',
      });
    }

    if (SECRET_KEY_PATTERN.test(key) && value.kind === 'literal' && value.value.trim()) {
      issues.push({
        code: 'hardcoded_secret',
        severity: 'error',
        field: `services.${service.id}.env.${key}`,
        message: 'Secrets, passwords, API keys, and salts must not be hardcoded; use generatedSecret, secretRef, or a secret deploy input.',
      });
    }

    if (referencesPublicServiceUrl(value)) {
      issues.push({
        code: 'service_ref_uses_public_url',
        severity: 'warning',
        field: `services.${service.id}.env.${key}`,
        message: 'Service-to-service variables should use private networking unless the public URL is explicitly required.',
      });
    }
  }

  return issues;
}

function hasPublicEndpoint(service: TemplateServiceSpec) {
  return service.ports.some(port => port.public === true);
}

function hasDescription(value: EnvValue) {
  return typeof value.description === 'string' && value.description.trim().length > 0;
}

function referencesPublicServiceUrl(value: EnvValue) {
  if (value.kind === 'serviceRef') return value.field === 'publicUrl';
  return value.kind === 'computed' && /\bpublicUrl\b|\bRAILWAY_PUBLIC_DOMAIN\b/.test(value.template);
}

/**
 * Cross-service checks that need to see the whole spec:
 * 1. env_ref_missing_dependency — service references another via env vars but doesn't declare it in dependsOn
 * 2. referenced_service_no_ports — service referenced via privateHost/DNS has no ports, so K8s ClusterIP won't exist
 */
function evaluateCrossServiceRules(spec: TemplateSpec): TemplatePracticeIssue[] {
  const issues: TemplatePracticeIssue[] = [];
  const validIds = new Set(spec.services.map(s => s.id));

  // Map serviceId → services that reference it via privateHost or env
  // (only privateHost references actually need a K8s ClusterIP Service for DNS)
  const referencedViaHost = new Map<string, string[]>();

  for (const service of spec.services) {
    const implied = getEnvImpliedDeps(service);
    const declared = new Set(service.dependsOn);

    for (const [key, value] of Object.entries(service.env)) {
      // --- Check 1: implicit dep not declared in dependsOn ---
      const envDeps = singleEnvImpliedDeps(value, service.id);
      for (const refId of envDeps) {
        if (!validIds.has(refId)) continue; // caught by schema validation
        if (!declared.has(refId)) {
          issues.push({
            code: 'env_ref_missing_dependency',
            severity: 'warning',
            field: `services.${service.id}.env.${key}`,
            message: `"${service.id}" references "${refId}" in its env vars but "${refId}" is missing from dependsOn — add it to guarantee "${refId}" is running before "${service.id}" starts.`,
          });
        }
      }

      // --- Collect services referenced via host/DNS (for Check 2) ---
      if (value.kind === 'serviceRef' && value.field === 'privateHost' && validIds.has(value.serviceId)) {
        pushTo(referencedViaHost, value.serviceId, service.id);
      }
      if (value.kind === 'computed') {
        const rx = /\$\{\s*services\.([a-z0-9-]+)\.(?:privateHost|env\.)/g;
        let m: RegExpExecArray | null;
        while ((m = rx.exec(value.template))) {
          if (m[1] !== service.id && validIds.has(m[1])) {
            pushTo(referencedViaHost, m[1], service.id);
          }
        }
      }
    }

    // Suppress TS6196 — implied used via getEnvImpliedDeps indirectly but TS can't see it
    void implied;
  }

  // --- Check 2: referenced service has no ports → no K8s Service → DNS fails ---
  for (const service of spec.services) {
    const referencers = referencedViaHost.get(service.id);
    if (referencers && referencers.length > 0 && service.ports.length === 0) {
      issues.push({
        code: 'referenced_service_no_ports',
        severity: 'error',
        field: `services.${service.id}.ports`,
        message: `"${service.id}" is used as a private hostname by ${referencers.map(r => `"${r}"`).join(', ')} but has no ports defined — Kubernetes cannot create a ClusterIP Service, so DNS lookup will fail at runtime. Add at least one internal port (e.g. port 5432 for Postgres).`,
      });
    }
  }

  return issues;
}

function singleEnvImpliedDeps(value: EnvValue, selfId: string): string[] {
  if (value.kind === 'serviceRef' || value.kind === 'secretRef') {
    return value.serviceId !== selfId ? [value.serviceId] : [];
  }
  if (value.kind === 'computed') {
    const deps: string[] = [];
    const rx = /\$\{\s*services\.([a-z0-9-]+)\./g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(value.template))) {
      if (m[1] !== selfId) deps.push(m[1]);
    }
    return deps;
  }
  return [];
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const arr = map.get(key) ?? [];
  arr.push(value);
  map.set(key, arr);
}
