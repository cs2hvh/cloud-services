import { z } from "zod";
import { NAMING_RULES } from "./constants";
import {
  ENV_KEY_REGEX,
  MAX_ENV_KEY_LENGTH,
  MAX_ENV_VALUE_LENGTH,
  MAX_ENV_VARS,
} from "@/lib/env/lifecycle";

// Reserved names that cannot be used for apps (DNS, K8s, system conflicts)
const RESERVED_APP_NAMES = [
  // System/Infrastructure
  'admin', 'api', 'app', 'apps', 'auth', 'console', 'dashboard', 'default',
  'system', 'root', 'null', 'undefined', 'true', 'false',
  // Kubernetes reserved
  'kube', 'kubernetes', 'k8s', 'cluster', 'node', 'nodes', 'pod', 'pods',
  'service', 'services', 'deployment', 'ingress', 'config', 'secret', 'secrets',
  // DNS/Networking
  'www', 'mail', 'ftp', 'ssh', 'dns', 'ns', 'ns1', 'ns2', 'mx', 'smtp', 'pop', 'imap',
  'localhost', 'local', 'test', 'staging', 'prod', 'production', 'dev', 'development',
  // Cloud services
  'jenkins', 'docker', 'registry', 'git', 'github', 'gitlab', 'bitbucket',
  'cloudflare', 'nginx', 'proxy', 'gateway', 'lb', 'loadbalancer',
  // Platform specific
  'galaxyhvh', 'hav0k', 'ahurasense', 'platform', 'internal', 'private', 'public',
] as const;

// Sanitize and validate app name for DNS/K8s/Jenkins compatibility
const sanitizeAppName = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')  // Replace invalid chars with hyphen
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .replace(/^-+|-+$/g, '');      // Remove leading/trailing hyphens
};

// Custom refinement for app name validation
const appNameValidation = z
  .string()
  .min(NAMING_RULES.MIN_CLUSTER_NAME_LENGTH, "App name must be at least 3 characters")
  .max(NAMING_RULES.MAX_CLUSTER_NAME_LENGTH, "App name must be at most 63 characters")
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "App name must start and end with a letter or number, and contain only lowercase letters, numbers, and hyphens")
  .refine((name) => !RESERVED_APP_NAMES.includes(name.toLowerCase() as typeof RESERVED_APP_NAMES[number]), {
    message: "This app name is reserved and cannot be used",
  })
  .refine((name) => !name.includes('--'), {
    message: "App name cannot contain consecutive hyphens",
  })
  .refine((name) => !/^\d+$/.test(name), {
    message: "App name cannot be purely numeric",
  })
  .refine((name) => name.length >= 3 && name.length <= 40, {
    message: "App name should be between 3 and 40 characters for optimal compatibility",
  })
  .transform(sanitizeAppName);

// Validation schemas for platform apps

const envVarItemSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Environment variable key is required")
    .max(MAX_ENV_KEY_LENGTH, `Environment variable key must be <= ${MAX_ENV_KEY_LENGTH} characters`)
    .regex(
      ENV_KEY_REGEX,
      "Environment variable key must use letters, digits, and underscores"
    ),
  value: z
    .string()
    .min(1, "Environment variable value is required")
    .max(MAX_ENV_VALUE_LENGTH, `Environment variable value must be <= ${MAX_ENV_VALUE_LENGTH} characters`),
});

const envVarListSchema = z
  .array(envVarItemSchema)
  .max(MAX_ENV_VARS, `Too many environment variables (max ${MAX_ENV_VARS})`)
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    for (const [idx, item] of items.entries()) {
      if (seen.has(item.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate environment variable key: ${item.key}`,
          path: [idx, "key"],
        });
      } else {
        seen.add(item.key);
      }
    }
  });

export const createPlatformAppSchema = z.object({
  name: appNameValidation,
  
  git_provider: z.enum(["github", "gitlab", "bitbucket"], {
    errorMap: () => ({ message: "Git provider must be github, gitlab, or bitbucket" }),
  }),
  
  repository_id: z.string().min(1, "Repository ID is required"),
  repository_name: z.string().min(1, "Repository name is required"),
  repository_url: z.string().url("Repository URL must be a valid URL"),
  
  branch: z.string().min(1, "Branch name is required").default("main"),
  
  framework: z.enum([
    "simple-test",
    "Next.js",
    "Nuxt.js",
    "Vite-React",
    "React", 
    "Vue.js",
    "Angular",
    "SvelteKit",
    "Svelte",
    "Node.js", 
    "express", 
    "python",
    "django",
    "flask",
    "fastapi",
    "Static",
    "Dockerfile",
    "Java"
  ], {
    errorMap: () => ({ message: "Invalid framework selection" }),
  }),
  
  build_command: z.string().optional(),
  output_directory: z.string().optional(),
  
  project_id: z.string().uuid("Project ID must be a valid UUID").optional(),
  
  env_vars: envVarListSchema.optional().default([]),
  size: z.enum(["small", "medium", "large", "xlarge", "xxlarge"]).optional().default("small"),
  auto_deploy: z.boolean().optional().default(false),
  deploy_branch: z.string().optional(),
  container_port: z.number().int().min(1).max(65535).optional(),
  healthcheck_path: z
    .string()
    .regex(/^\//, "Health check path must start with /")
    .max(255, "Health check path must be at most 255 characters")
    .optional(),
});

export type CreatePlatformAppPayload = z.infer<typeof createPlatformAppSchema>;

export const updatePlatformAppSchema = z.object({
  app_id: z.string().uuid("App ID must be a valid UUID"),
  
  // Only safe metadata fields that don't require redeployment.
  name: z.string().min(NAMING_RULES.MIN_CLUSTER_NAME_LENGTH).max(NAMING_RULES.MAX_CLUSTER_NAME_LENGTH).optional(),
  auto_deploy: z.boolean().optional(),
  
  // NOTE: Build config fields (branch, framework, build_command, output_directory) are NOT allowed.
  // These require redeployment - use the redeploy endpoint instead.
  
  // Internal-only fields (not exposed via API v1)
  status: z.enum(["pending", "building", "running", "failed", "stopped"]).optional(),
  deployment_url: z.string().url().optional(),
  container_port: z.number().int().min(1).max(65535).optional(),
}).strict();

export type UpdatePlatformAppPayload = z.infer<typeof updatePlatformAppSchema>;

export const deletePlatformAppSchema = z.object({
  app_id: z.string().uuid("App ID must be a valid UUID"),
  is_admin: z.boolean().optional().default(false),
});

export type DeletePlatformAppPayload = z.infer<typeof deletePlatformAppSchema>;

export const getPlatformAppSchema = z.object({
  app_id: z.string().uuid("App ID must be a valid UUID"),
});

export type GetPlatformAppPayload = z.infer<typeof getPlatformAppSchema>;

export const updateEnvVarsSchema = z.object({
  app_id: z.string().uuid("App ID must be a valid UUID"),
  env_vars: envVarListSchema,
  // Keys of existing vars that the user did not reveal or modify.
  // The backend will preserve them without overwriting their stored values.
  kept_keys: z
    .array(z.string().regex(ENV_KEY_REGEX, "Invalid env key"))
    .max(MAX_ENV_VARS)
    .optional()
    .default([]),
});

export type UpdateEnvVarsPayload = z.infer<typeof updateEnvVarsSchema>;

/** Used by POST /api/services/platform-apps/env-vars/reveal */
export const revealEnvVarSchema = z.object({
  app_id: z.string().uuid("App ID must be a valid UUID"),
  key: z
    .string()
    .trim()
    .min(1, "Key is required")
    .max(MAX_ENV_KEY_LENGTH, `Key must be <= ${MAX_ENV_KEY_LENGTH} characters`)
    .regex(ENV_KEY_REGEX, "Invalid env key format"),
});

export type RevealEnvVarPayload = z.infer<typeof revealEnvVarSchema>;

export const rollbackPlatformAppSchema = z.object({
  app_id: z.string().uuid("App ID must be a valid UUID"),
});

export type RollbackPlatformAppPayload = z.infer<typeof rollbackPlatformAppSchema>;

export const resizePlatformAppSchema = z.object({
  app_id: z.string().uuid("App ID must be a valid UUID"),
  new_size: z.enum(["small", "medium", "large", "xlarge", "xxlarge"], {
    errorMap: () => ({ message: "Size must be small, medium, large, xlarge, or xxlarge" }),
  }),
  container_port: z.number().int().min(1).max(65535).optional(),
});

export type ResizePlatformAppPayload = z.infer<typeof resizePlatformAppSchema>;

// ─── Custom Profile Validation ────────────────────────────────────────────────

// Valid K8s CPU quantity: "250m" | "0.5" | "4" | "4000m"
const K8S_CPU_RE = /^(\d+(\.\d+)?)(m?)$/;
// Valid K8s memory quantity: "256Mi" | "4Gi" | "512Ki" | "32768" (raw bytes)
const K8S_MEM_RE = /^\d+(\.\d+)?(Ki|Mi|Gi|Ti|Pi|Ei|k|M|G|T|P|E)?$/;

function parseCpuMillicores(value: string): number | null {
  const m = K8S_CPU_RE.exec(value.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n) || n <= 0) return null;
  return m[3] === 'm' ? n : n * 1000;
}

function parseMemoryBytes(value: string): number | null {
  const m = K8S_MEM_RE.exec(value.trim());
  if (!m) return null;
  const n = parseFloat(value);
  if (!isFinite(n) || n <= 0) return null;
  const multipliers: Record<string, number> = {
    Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4,
    Pi: 1024 ** 5, Ei: 1024 ** 6,
    k: 1000,  M: 1000 ** 2,  G: 1000 ** 3,  T: 1000 ** 4,
    P: 1000 ** 5, E: 1000 ** 6,
  };
  const suffix = m[2];
  return suffix ? n * (multipliers[suffix] ?? 1) : n;
}

const MAX_CUSTOM_REPLICAS = 20;

/**
 * Validate a custom deployment profile spec submitted by an admin.
 * Returns a human-readable error string on failure, or null on success.
 */
export function validateCustomSpec(spec: unknown, hourlyRate: unknown): string | null {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return 'custom_spec must be an object';
  }

  const s = spec as Record<string, unknown>;
  const required = ['cpuRequest', 'cpuLimit', 'memoryRequest', 'memoryLimit', 'replicas'] as const;
  const allowed = new Set<string>(required);
  const unsupportedField = Object.keys(s).find((field) => !allowed.has(field));
  if (unsupportedField) {
    return `custom_spec.${unsupportedField} is not supported`;
  }

  for (const field of required) {
    if (s[field] === undefined) return `custom_spec.${field} is required`;
  }

  const cpuReq = parseCpuMillicores(String(s.cpuRequest));
  if (cpuReq === null) return 'custom_spec.cpuRequest must be a valid K8s CPU quantity (e.g. "4" or "4000m")';

  const cpuLim = parseCpuMillicores(String(s.cpuLimit));
  if (cpuLim === null) return 'custom_spec.cpuLimit must be a valid K8s CPU quantity';
  if (cpuLim < cpuReq) return 'custom_spec.cpuLimit must be >= cpuRequest';

  const memReq = parseMemoryBytes(String(s.memoryRequest));
  if (memReq === null) return 'custom_spec.memoryRequest must be a valid K8s memory quantity (e.g. "8Gi")';

  const memLim = parseMemoryBytes(String(s.memoryLimit));
  if (memLim === null) return 'custom_spec.memoryLimit must be a valid K8s memory quantity';
  if (memLim < memReq) return 'custom_spec.memoryLimit must be >= memoryRequest';

  const replicas = s.replicas;
  if (!Number.isInteger(replicas) || (replicas as number) < 1 || (replicas as number) > MAX_CUSTOM_REPLICAS) {
    return `custom_spec.replicas must be an integer between 1 and ${MAX_CUSTOM_REPLICAS}`;
  }

  if (typeof hourlyRate !== 'number' || !isFinite(hourlyRate) || hourlyRate <= 0) {
    return 'custom_hourly_rate must be a positive number';
  }

  return null;
}
