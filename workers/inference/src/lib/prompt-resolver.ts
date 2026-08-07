/**
 * Prompt management resolver — Phase 3 S3.
 *
 * Resolves "name@label" references from the X-Ahura-Prompt header into
 * rendered message arrays injected into the outgoing request body.
 *
 * Resolution order (mirrors guardrail.ts pattern):
 *   1. Per-isolate in-memory cache (Map, 5-min TTL)
 *   2. CF KV — written-through by the control plane on every label publish
 *   3. Postgres — read-through on KV miss so cold starts and failed
 *      write-throughs never break customer requests
 *
 * Variable interpolation: conservative {{var}} only — no eval, no loops.
 * Missing vars are left literal ("{{missing}}") so a bad template fails
 * visibly instead of silently dropping instructions.
 */
import { createClient } from "@supabase/supabase-js";
import type { Env } from "../types.ts";

// ─── Shared types (exported so cf-kv.ts and control-plane routes use the same shape) ──

/** The shape stored in KV and in Postgres (template + resolved metadata). */
export interface StoredPrompt {
  promptId: string;
  version: number;
  /** messages[] with {{var}} placeholders — OpenAI message shape. */
  template: Array<{ role: string; content: string }>;
  modelDefaults: Record<string, unknown>;
}

export interface ResolvedPrompt {
  promptId: string;
  version: number;
  /** Rendered messages (placeholders filled). */
  messages: Array<{ role: string; content: string }>;
  /** Model/param defaults from the template (lowest priority — caller overrides). */
  modelDefaults: Record<string, unknown>;
}

/**
 * Where rendered template messages are injected relative to caller messages.
 *   prepend  — template first, then caller (default, correct for system prompts)
 *   append   — caller first, then template (for context injection after conversation)
 *   replace  — template replaces caller messages entirely
 */
export type PromptMergeStrategy = "prepend" | "append" | "replace";

// ─── Cache ───────────────────────────────────────────────────────────────────

const KV_TTL_MS = 5 * 60_000;
const cache = new Map<string, { data: StoredPrompt; expiresAt: number }>();

// ─── Resolution ──────────────────────────────────────────────────────────────

/**
 * Resolve a prompt reference ("support-bot@production" or "support-bot")
 * for an org. Returns null only if the prompt + label genuinely doesn't
 * exist in either KV or Postgres — never null due to infra hiccups.
 */
export async function resolvePrompt(
  env: Env,
  orgId: string,
  ref: string,
  vars: Record<string, unknown>
): Promise<ResolvedPrompt | null> {
  const [name, label = "production"] = ref.split("@");
  const kvKey = `prompt:${orgId}:${name}:${label}`;

  // 1. Isolate cache
  const cached = cache.get(kvKey);
  if (cached && cached.expiresAt > Date.now()) {
    return renderPrompt(cached.data, vars);
  }

  // 2. KV
  const raw = await env.PROMPTS.get<StoredPrompt>(kvKey, "json");
  if (raw) {
    cache.set(kvKey, { data: raw, expiresAt: Date.now() + KV_TTL_MS });
    return renderPrompt(raw, vars);
  }

  // 3. Postgres fallback — so a cold start or failed write-through from the
  //    control plane never serves a 400 to the customer.
  //    Single JOIN query instead of two round-trips (saves ~3-6ms per cold start).
  try {
    const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data } = await sb
      .schema("inference")
      .from("prompts")
      .select("id, prompt_versions!inner(version, template, model_defaults)")
      .eq("org_id", orgId)
      .eq("name", name)
      .eq("prompt_versions.label", label)
      .maybeSingle();

    if (data) {
      const versions = data.prompt_versions as Array<{
        version: number;
        template: Array<{ role: string; content: string }>;
        model_defaults: Record<string, unknown>;
      }>;
      const version = versions[0];
      if (version) {
        const stored: StoredPrompt = {
          promptId: data.id as string,
          version: version.version,
          template: version.template,
          modelDefaults: version.model_defaults ?? {},
        };
        // Back-fill KV so subsequent requests are fast
        void env.PROMPTS.put(kvKey, JSON.stringify(stored), { expirationTtl: 300 });
        cache.set(kvKey, { data: stored, expiresAt: Date.now() + KV_TTL_MS });
        return renderPrompt(stored, vars);
      }
    }
  } catch {
    // Postgres unreachable — fall through to null so the caller can return
    // a clear 404 rather than a misleading 500.
  }

  return null;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function renderPrompt(stored: StoredPrompt, vars: Record<string, unknown>): ResolvedPrompt {
  return {
    promptId: stored.promptId,
    version: stored.version,
    modelDefaults: stored.modelDefaults ?? {},
    messages: stored.template.map((m) => ({
      role: m.role,
      content: interpolate(m.content, vars),
    })),
  };
}

/** Conservative {{var}} interpolation — missing keys kept literal. */
function interpolate(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match
  );
}

// ─── Application ─────────────────────────────────────────────────────────────

/**
 * Merge a resolved prompt into an outgoing body.
 *
 * Strategy controls where template messages land:
 *   prepend  — [template...][caller...]   (default — for system prompts)
 *   append   — [caller...][template...]   (for injecting context after conversation)
 *   replace  — [template...]              (template is the entire conversation)
 *
 * Model defaults fill gaps only (caller's explicit fields always win).
 */
export function applyPrompt(
  body: Record<string, unknown>,
  prompt: ResolvedPrompt,
  strategy: PromptMergeStrategy = "prepend"
): Record<string, unknown> {
  const callerMessages =
    (body.messages as Array<{ role: string; content: unknown }>) ?? [];

  const merged =
    strategy === "replace"
      ? prompt.messages
      : strategy === "append"
        ? [...callerMessages, ...prompt.messages]
        : [...prompt.messages, ...callerMessages]; // prepend (default)

  return {
    ...prompt.modelDefaults, // lowest priority
    ...body,                 // caller overrides defaults
    messages: merged,
  };
}
