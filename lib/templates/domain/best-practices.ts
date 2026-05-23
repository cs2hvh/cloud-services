import type { EnvValue, TemplateServiceSpec, TemplateSpec } from './spec-schema';

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
