/**
 * Per-capability kill switches for the AI platform.
 *
 * WHY: the only switch that existed was `gpu_deploy_enabled`. When an upstream
 * provider degrades, or a model starts losing money on every call, or a runner
 * has to be drained, the only lever was deactivating models one at a time in the
 * catalog — which does not touch agents, media or connector syncs at all.
 *
 * SAME TABLE, SAME PATTERN as `gpu_deploy_enabled` (public.platform_settings),
 * deliberately: that switch has been in production since 2026-06 and the
 * failure-open behaviour below is copied from it.
 *
 * FAIL OPEN, ALWAYS. A missing row, an unreachable database or a malformed value
 * all mean ENABLED. A kill switch that takes the platform down when its own
 * storage hiccups is a bigger outage than the one it exists to contain, and the
 * switches are seeded `true` by migration 20260804000001 so "missing" and "on"
 * genuinely are the same state.
 */
import { createClient } from "@supabase/supabase-js";

export interface FeatureSwitchSpec {
  key: string;
  label: string;
  /** What STOPS for customers when this is turned off. Written for an operator. */
  effect: string;
  /** Where the switch is enforced, so nobody has to grep for it. */
  enforced_in: string;
}

/**
 * Five switches, each enforced somewhere real.
 *
 * A switch nobody checks is worse than no switch: an operator flips it, believes
 * the bleeding stopped, and it did not. So the list is exactly the capabilities
 * that have an enforcement point, and `enforced_in` names it.
 */
export const FEATURE_SWITCHES: FeatureSwitchSpec[] = [
  {
    key: "ai_inference_enabled",
    label: "Inference API",
    effect:
      "Chat completions, embeddings, rerank, moderations and the Messages shim all return 503. This stops essentially all AI revenue — use it only for a real incident.",
    enforced_in: "workers/inference/src/middleware/feature-gate.ts",
  },
  {
    key: "ai_agents_enabled",
    label: "Agents",
    effect: "New agent runs are refused. Runs already in flight are unaffected, and agent management stays available so customers can still fix a runaway agent.",
    enforced_in: "workers/inference/src/middleware/feature-gate.ts",
  },
  {
    key: "ai_media_enabled",
    label: "Media generation",
    effect: "Image, video, music, speech and OCR requests are refused. Polling an existing job still works.",
    enforced_in: "workers/inference/src/middleware/feature-gate.ts",
  },
  {
    key: "ai_connector_sync_enabled",
    label: "RAG connector syncs",
    effect:
      "The scheduler stops enqueueing due connectors and manual syncs are refused. Existing vector data stays searchable; it just stops being refreshed.",
    enforced_in: "app/api/inference/internal/connector-scheduler + the gateway's sync route",
  },
  {
    key: "ai_finetuning_enabled",
    label: "Fine-tuning",
    effect: "New fine-tune jobs are refused before any GPU is provisioned. Running jobs continue.",
    enforced_in: "app/api/inference/fine-tuning/jobs",
  },
];

export function findSwitch(key: string): FeatureSwitchSpec | undefined {
  return FEATURE_SWITCHES.find((s) => s.key === key);
}

/**
 * Cache. Short TTL so a flip takes effect almost immediately, long enough that
 * a hot path does not query per request. Mirrors the 10s TTL on the GPU switch.
 */
const TTL_MS = 10_000;
const cache = new Map<string, { value: boolean; at: number }>();

/** Drop the cache — used by the admin write path so a flip is visible at once. */
export function invalidateSwitchCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

/** Is this capability currently enabled? Fails OPEN — see the header. */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle<{ value: unknown }>();
    const enabled = error || data == null ? true : data.value !== false;
    cache.set(key, { value: enabled, at: Date.now() });
    return enabled;
  } catch {
    return true;
  }
}

/** Every switch's current state, for the admin page. Also fails open per key. */
export async function readAllSwitches(): Promise<Record<string, boolean>> {
  const state: Record<string, boolean> = {};
  for (const spec of FEATURE_SWITCHES) state[spec.key] = true;
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const { data } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", FEATURE_SWITCHES.map((s) => s.key))
      .returns<Array<{ key: string; value: unknown }>>();
    for (const row of data ?? []) state[row.key] = row.value !== false;
  } catch {
    /* fail open — every key stays true */
  }
  return state;
}

export async function setFeatureEnabled(key: string, enabled: boolean, userId?: string | null): Promise<void> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { error } = await supabase
    .from("platform_settings")
    .upsert(
      { key, value: enabled, updated_at: new Date().toISOString(), updated_by: userId ?? null },
      { onConflict: "key" }
    );
  if (error) throw new Error(error.message);
  cache.set(key, { value: enabled, at: Date.now() });
}

/** The 503 body every enforcement point returns, so the message never drifts. */
export function disabledResponseBody(spec: FeatureSwitchSpec): {
  error: string;
  code: string;
} {
  return {
    error: `${spec.label} is temporarily unavailable while we work on the platform. No charge is made for refused requests.`,
    code: "feature_disabled",
  };
}
