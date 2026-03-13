#!/usr/bin/env tsx
import { createPlatformAppSchema } from "@/lib/validation/platform-apps";
import {
  analyzeEnvLifecycle,
  getMappedFrameworkKeys,
  resolveFrameworkProfile,
  type EnvVar,
} from "@/lib/env/lifecycle";

const strictMode = process.argv.includes("--strict");

const frameworkEnum = createPlatformAppSchema.shape.framework;
const frameworks = "options" in frameworkEnum ? [...frameworkEnum.options] : [];

const sampleEnv: EnvVar[] = [
  { key: "DATABASE_URL", value: "postgres://example" },
  { key: "NEXT_PUBLIC_API_URL", value: "https://api.example.com" },
  { key: "NUXT_PUBLIC_API_URL", value: "https://api.example.com" },
  { key: "PUBLIC_SITE_NAME", value: "my-site" },
  { key: "VITE_API_URL", value: "https://api.example.com" },
];

console.log("\nEnvironment Lifecycle Analysis (pipeline-aligned)\n");

const rows = frameworks.map((framework) => {
  const { explicit, profile } = resolveFrameworkProfile(framework);
  const analysis = analyzeEnvLifecycle(framework, sampleEnv);
  return {
    framework,
    mapped: explicit ? "yes" : "fallback",
    pipeline: profile.pipeline,
    runtime_injection: analysis.supportsRuntimeInjection ? "yes" : "no",
    build_prefixes: analysis.buildTimePrefixes.join(", ") || "-",
    mode_with_sample: analysis.mode,
    requires_redeploy: analysis.requiresRedeploy ? "yes" : "no",
    ignored_keys: analysis.ignoredKeys.join(", ") || "-",
  };
});

console.table(rows);

const fallbackFrameworks = rows.filter((row) => row.mapped !== "yes").map((row) => row.framework);

if (fallbackFrameworks.length > 0) {
  console.log("Frameworks using runtime fallback profile:");
  console.log(`- ${fallbackFrameworks.join("\n- ")}`);
}

if (strictMode && fallbackFrameworks.length > 0) {
  console.error("\n[env:analyze:strict] Unmapped framework(s) detected.");
  process.exit(1);
}

console.log("\nMapped framework keys in lifecycle module:");
console.log(getMappedFrameworkKeys().join(", "));

