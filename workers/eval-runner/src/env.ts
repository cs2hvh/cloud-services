import {
  required,
  optional,
  optionalInt,
  loadCoreEnv,
  type CoreRunnerEnv,
} from "@ahura/runner-core";

export interface RunnerEnv extends CoreRunnerEnv {
  // The inference gateway to call for target model + llm_judge model completions.
  // Typically https://api.ahurasense.com/v1
  inferenceBaseUrl: string;
  // Platform key to authenticate against the inference gateway.
  // This key must have access to all models the eval runner needs to call
  // (target model + judge model). Kept separate from user-facing keys.
  inferencePlatformKey: string;

  // Processing tunables
  concurrentCases: number;   // cases processed in parallel within one run
  caseTimeoutMs: number;     // per-case HTTP timeout
}

export function loadEnv(): RunnerEnv {
  return {
    ...loadCoreEnv(),

    inferenceBaseUrl: optional("INFERENCE_BASE_URL", "https://api.ahurasense.com/v1").replace(/\/+$/, ""),
    inferencePlatformKey: required("INFERENCE_PLATFORM_KEY"),

    concurrentCases: optionalInt("CONCURRENT_CASES", 4),
    caseTimeoutMs: optionalInt("CASE_TIMEOUT_MS", 60_000),
  };
}
