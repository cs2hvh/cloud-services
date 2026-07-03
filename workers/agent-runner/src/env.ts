import {
  required,
  optional,
  optionalInt,
  loadCoreEnv,
  type CoreRunnerEnv,
} from "@ahura/runner-core";

export interface RunnerEnv extends CoreRunnerEnv {
  // The inference gateway the agent loop calls for each model turn.
  // Typically https://api.ahurasense.com/v1 — every turn is an internal /v1
  // call, so model routing stays brand-hidden (§6).
  inferenceBaseUrl: string;
  // Platform key authenticating the runner against the inference gateway. Must
  // have access to the models agents run on. Kept separate from user keys.
  inferencePlatformKey: string;

  // Per-model-turn HTTP timeout.
  modelTurnTimeoutMs: number;
  // Re-check run.cost_cents vs max_cost_cents every K steps (mid-run guard, §9).
  costRecheckEverySteps: number;

  // Web search (S2.2) — brand-hidden behind a citation envelope. Optional: if the
  // key is absent, the web_search tool errors gracefully ("not configured").
  webSearchProvider: string;      // 'brave' (default) | 'exa'
  webSearchApiKey: string | null;
  toolTimeoutMs: number;          // per hosted-tool / webhook call timeout
}

export function loadEnv(): RunnerEnv {
  return {
    ...loadCoreEnv(),

    inferenceBaseUrl: optional("INFERENCE_BASE_URL", "https://api.ahurasense.com/v1").replace(/\/+$/, ""),
    inferencePlatformKey: required("INFERENCE_PLATFORM_KEY"),

    modelTurnTimeoutMs: optionalInt("MODEL_TURN_TIMEOUT_MS", 120_000),
    costRecheckEverySteps: optionalInt("COST_RECHECK_EVERY_STEPS", 1),

    webSearchProvider: optional("WEB_SEARCH_PROVIDER", "brave"),
    webSearchApiKey: process.env.WEB_SEARCH_API_KEY?.trim() || process.env.BRAVE_API_KEY?.trim() || null,
    toolTimeoutMs: optionalInt("TOOL_TIMEOUT_MS", 30_000),
  };
}
