import { z } from "zod";
import { splitEnvVarsByFramework } from "@/lib/validation/env-vars";

export interface EnvVar {
  key: string;
  value: string;
}

export const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const MAX_ENV_VARS = 200;
export const MAX_ENV_KEY_LENGTH = 128;
export const MAX_ENV_VALUE_LENGTH = 8192;

export const EnvVarSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Environment variable key is required")
    .max(MAX_ENV_KEY_LENGTH, `Environment variable key must be <= ${MAX_ENV_KEY_LENGTH} characters`)
    .regex(
      ENV_KEY_REGEX,
      "Environment variable key must use letters, digits, and underscores (e.g. DATABASE_URL)"
    ),
  value: z
    .string()
    .min(1, "Environment variable value is required")
    .max(MAX_ENV_VALUE_LENGTH, `Environment variable value must be <= ${MAX_ENV_VALUE_LENGTH} characters`),
});

export const EnvVarListSchema = z
  .array(EnvVarSchema)
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

export const ReplaceEnvVarsRequestSchema = z.object({
  env_vars: EnvVarListSchema,
});

type FrameworkProfile = {
  pipeline: string;
  supportsRuntimeInjection: boolean;
  buildTimePrefixes: string[];
  allVarsAreBuildTime: boolean;
};

const PROFILE: Record<string, FrameworkProfile> = {
  runtime: {
    pipeline: "runtime",
    supportsRuntimeInjection: true,
    buildTimePrefixes: [],
    allVarsAreBuildTime: false,
  },
  nextjs: {
    pipeline: "nextjs",
    supportsRuntimeInjection: true,
    buildTimePrefixes: ["NEXT_PUBLIC_"],
    allVarsAreBuildTime: false,
  },
  nuxtjs: {
    pipeline: "nuxtjs",
    supportsRuntimeInjection: true,
    buildTimePrefixes: ["NUXT_PUBLIC_", "PUBLIC_", "VITE_"],
    allVarsAreBuildTime: false,
  },
  sveltekit: {
    pipeline: "sveltekit",
    supportsRuntimeInjection: true,
    buildTimePrefixes: ["PUBLIC_"],
    allVarsAreBuildTime: false,
  },
  vitereact: {
    pipeline: "vite-react",
    supportsRuntimeInjection: false,
    buildTimePrefixes: ["VITE_"],
    allVarsAreBuildTime: false,
  },
  vue: {
    pipeline: "vue",
    supportsRuntimeInjection: false,
    buildTimePrefixes: ["VITE_"],
    allVarsAreBuildTime: false,
  },
  angular: {
    pipeline: "angular",
    supportsRuntimeInjection: false,
    buildTimePrefixes: [],
    allVarsAreBuildTime: true,
  },
  react: {
    pipeline: "react",
    supportsRuntimeInjection: false,
    buildTimePrefixes: ["REACT_APP_", "VITE_"],
    allVarsAreBuildTime: false,
  },
  static: {
    pipeline: "static",
    supportsRuntimeInjection: false,
    buildTimePrefixes: [],
    allVarsAreBuildTime: true,
  },
};

// Keep this aligned with JenkinsService.selectPipeline framework switch.
const FRAMEWORK_TO_PROFILE: Record<string, keyof typeof PROFILE> = {
  "simple-test": "runtime",
  test: "runtime",
  dockerfile: "runtime",
  custom: "runtime",
  java: "runtime",
  maven: "runtime",
  spring: "runtime",
  "spring-boot": "runtime",
  springboot: "runtime",
  express: "runtime",
  "express.js": "runtime",
  python: "runtime",
  django: "runtime",
  flask: "runtime",
  fastapi: "runtime",
  nodejs: "runtime",
  "node.js": "runtime",
  node: "runtime",
  // Jenkins currently routes these through the Node.js/runtime pipeline.
  react: "runtime",
  static: "runtime",
  svelte: "runtime",
  nextjs: "nextjs",
  "next.js": "nextjs",
  next: "nextjs",
  nuxtjs: "nuxtjs",
  "nuxt.js": "nuxtjs",
  nuxt: "nuxtjs",
  sveltekit: "sveltekit",
  "vite-react": "vitereact",
  vitereact: "vitereact",
  "react-vite": "vitereact",
  vue: "vue",
  "vue.js": "vue",
  vuejs: "vue",
  angular: "angular",
};

export type EnvApplyMode = "runtime_only" | "build_time_only" | "mixed" | "persisted_only";

export interface EnvLifecycleAnalysis {
  framework: string | null;
  normalizedFramework: string;
  pipeline: string;
  supportsRuntimeInjection: boolean;
  buildTimePrefixes: string[];
  buildTimeKeys: string[];
  runtimeKeys: string[];
  ignoredKeys: string[];
  hasBuildTimeVars: boolean;
  hasRuntimeVars: boolean;
  ignoredOnly: boolean;
  effectiveKeyCount: number;
  requiresRedeploy: boolean;
  mode: Exclude<EnvApplyMode, "persisted_only">;
  reason: string;
}

function normalizeFramework(framework: string | null | undefined): string {
  if (!framework) return "";
  return framework.toLowerCase().trim();
}

export function resolveFrameworkProfile(framework: string | null | undefined) {
  const normalized = normalizeFramework(framework);
  const explicit = Object.prototype.hasOwnProperty.call(FRAMEWORK_TO_PROFILE, normalized);
  const profileKey = FRAMEWORK_TO_PROFILE[normalized] ?? "runtime";
  return { normalized, explicit, profileKey, profile: PROFILE[profileKey] };
}

export function getMappedFrameworkKeys(): string[] {
  return Object.keys(FRAMEWORK_TO_PROFILE).sort();
}

export function analyzeEnvLifecycle(
  framework: string | null | undefined,
  envVars: EnvVar[]
): EnvLifecycleAnalysis {
  const { normalized, profile } = resolveFrameworkProfile(framework);

  // Reuse existing framework env splitting logic to avoid duplicate lifecycle behavior.
  const split = splitEnvVarsByFramework(framework ?? "", envVars);
  let buildTimeKeys = split.buildTimeVars.map((e) => e.key);
  let runtimeKeys = split.runtimeVars.map((e) => e.key);

  // For the runtime pipeline, Jenkins applies all env vars via runtime secret/envFrom.
  // Treat all keys as runtime to keep secret reconciliation aligned with deployment behavior.
  if (profile.pipeline === "runtime") {
    buildTimeKeys = [];
    runtimeKeys = envVars.map((e) => e.key);
  }

  // Fallback for unknown framework keys: treat as runtime profile (safe default).
  if (
    envVars.length > 0 &&
    buildTimeKeys.length === 0 &&
    runtimeKeys.length === 0 &&
    profile.buildTimePrefixes.length === 0 &&
    !profile.allVarsAreBuildTime
  ) {
    runtimeKeys = envVars.map((e) => e.key);
  }

  const effectiveKeys = new Set<string>([...buildTimeKeys, ...runtimeKeys]);
  const ignoredKeys = envVars.map((e) => e.key).filter((key) => !effectiveKeys.has(key));

  const hasBuildTimeVars = buildTimeKeys.length > 0;
  const hasRuntimeVars = runtimeKeys.length > 0;
  const effectiveKeyCount = buildTimeKeys.length + runtimeKeys.length;
  const ignoredOnly = envVars.length > 0 && effectiveKeyCount === 0 && ignoredKeys.length === envVars.length;
  const requiresRedeploy = hasBuildTimeVars || profile.allVarsAreBuildTime;

  let mode: Exclude<EnvApplyMode, "persisted_only"> = "runtime_only";
  if (hasBuildTimeVars && hasRuntimeVars) mode = "mixed";
  else if (hasBuildTimeVars || profile.allVarsAreBuildTime) mode = "build_time_only";

  let reason = "Runtime variables can be applied live.";
  if (mode === "mixed") {
    reason = "Build-time and runtime variables detected.";
  } else if (mode === "build_time_only") {
    reason = "Build-time variables detected.";
  }
  if (ignoredOnly) {
    reason = "All provided variables are ignored by this pipeline for the current framework.";
  }
  if (ignoredKeys.length > 0) {
    reason += ` ${ignoredKeys.length} key(s) are ignored by this pipeline because they do not match required public prefixes.`;
  }

  return {
    framework: framework ?? null,
    normalizedFramework: normalized,
    pipeline: profile.pipeline,
    supportsRuntimeInjection: profile.supportsRuntimeInjection,
    buildTimePrefixes: profile.buildTimePrefixes,
    buildTimeKeys,
    runtimeKeys,
    ignoredKeys,
    hasBuildTimeVars,
    hasRuntimeVars,
    ignoredOnly,
    effectiveKeyCount,
    requiresRedeploy,
    mode,
    reason,
  };
}
