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
  size: z.enum(["small", "medium", "large"]).optional().default("small"),
  auto_deploy: z.boolean().optional().default(false),
  deploy_branch: z.string().optional(),
  container_port: z.number().int().min(1).max(65535).optional(),
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
});

export type UpdateEnvVarsPayload = z.infer<typeof updateEnvVarsSchema>;

export const rollbackPlatformAppSchema = z.object({
  app_id: z.string().uuid("App ID must be a valid UUID"),
});

export type RollbackPlatformAppPayload = z.infer<typeof rollbackPlatformAppSchema>;

export const resizePlatformAppSchema = z.object({
  app_id: z.string().uuid("App ID must be a valid UUID"),
  new_size: z.enum(["small", "medium", "large"], {
    errorMap: () => ({ message: "Size must be small, medium, or large" }),
  }),
  container_port: z.number().int().min(1).max(65535).optional(),
});

export type ResizePlatformAppPayload = z.infer<typeof resizePlatformAppSchema>;
