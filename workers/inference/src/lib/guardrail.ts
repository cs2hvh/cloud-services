/**
 * Guardrail resolution + evaluation for the inference gateway.
 *
 * Pure evaluation primitives (patterns, PII, regex) live in
 * lib/guardrail-eval.ts and are shared with the control plane.
 * This file owns the Worker-specific pieces: KV/Postgres policy
 * resolution, the rule evaluator registry, and the outgoing
 * message rewrite for redact mode.
 *
 * Adding a new rule type (e.g. "moderation" in S5):
 *   1. Extend the GuardrailRule union below.
 *   2. Register an evaluator in RULE_EVALUATORS.
 *   3. That's it — evaluateOrgGuardrail picks it up automatically.
 */

import { createClient } from "@supabase/supabase-js";
import type { Env } from "../types.ts";
import {
  evaluateJailbreak,
  evaluateRegex,
  redactPii,
  type GuardrailHit,
  type GuardrailSeverity,
  type PiiCategory,
} from "../../../../lib/guardrail-eval.ts";

// Re-export shared primitives so callers only need one import.
export type { GuardrailHit, GuardrailSeverity, PiiCategory };
export { redactPii };

// ─── Worker-specific types ────────────────────────────────────────────────────

export type GuardrailPolicy = "off" | "warn" | "block" | "redact";
export type GuardrailAction = "clean" | "flagged" | "blocked" | "redacted";

export interface GuardrailDecision {
  action: GuardrailAction;
  policy: GuardrailPolicy;
  hits: GuardrailHit[];
}

/**
 * A rule inside an org's guardrail policy (stored in Postgres, cached in KV).
 *
 * To add a new rule type: extend this union, register in RULE_EVALUATORS.
 *   jailbreak  — run the shared JAILBREAK_PATTERNS set
 *   pii        — detect + redact PII for the listed categories
 *   regex      — custom pattern with severity
 */
export type GuardrailRule =
  | { type: "jailbreak" }
  | { type: "pii"; categories: PiiCategory[] }
  | { type: "regex"; pattern: string; flags?: string; severity: GuardrailSeverity; id?: string };

/** Shape stored under KV key "guardrail:{orgId}:{name}" */
export interface OrgGuardrailPolicy {
  name: string;
  mode: GuardrailPolicy;
  rules: GuardrailRule[];
}

// ─── Keyword-mode backwards compat ───────────────────────────────────────────

/** @deprecated Use resolveOrgGuardrailPolicy instead. */
export function parseGuardrailPolicy(headerValue: string | null | undefined): GuardrailPolicy {
  const v = headerValue?.toLowerCase().trim();
  if (v === "off" || v === "block" || v === "warn") return v;
  return "warn";
}

/** Evaluate a simple keyword-mode policy (no per-org rules). */
export function evaluateGuardrail(
  texts: Array<string | null | undefined>,
  policy: GuardrailPolicy
): GuardrailDecision {
  if (policy === "off") return { action: "clean", policy, hits: [] };

  const clean = texts.filter((t): t is string => !!t);
  const hits = evaluateJailbreak(clean);
  if (hits.length === 0) return { action: "clean", policy, hits: [] };

  const hasCritical = hits.some((h) => h.severity === "critical");
  if (policy === "block" && hasCritical) return { action: "blocked", policy, hits };
  return { action: "flagged", policy, hits };
}

// ─── Per-org named policy resolution ─────────────────────────────────────────

/** Cached from KV — shared across concurrent requests within one isolate. */
const policyCache = new Map<string, { policy: OrgGuardrailPolicy; expiresAt: number }>();
const POLICY_TTL_MS = 5 * 60_000;

/**
 * Resolve the X-Ahura-Guardrail header value into an OrgGuardrailPolicy.
 *
 * Keywords ("off"/"warn"/"block"/"redact") synthesize a jailbreak policy at
 * that mode. Named values load from KV (written-through by the control plane)
 * with a Postgres read-through fallback so cold-start KV misses don't silently
 * degrade a named block/redact policy to "warn".
 */
export async function resolveOrgGuardrailPolicy(
  env: Env,
  orgId: string,
  headerValue: string | null | undefined
): Promise<OrgGuardrailPolicy> {
  const val = headerValue?.trim() ?? "";
  const KEYWORDS = new Set(["off", "warn", "block", "redact"]);

  if (!val || KEYWORDS.has(val.toLowerCase())) {
    const mode = (KEYWORDS.has(val.toLowerCase()) ? val.toLowerCase() : "warn") as GuardrailPolicy;
    return { name: "__keyword__", mode, rules: [{ type: "jailbreak" }] };
  }

  const cacheKey = `${orgId}::${val}`;
  const cached = policyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.policy;

  const raw = await env.GUARDRAILS.get<OrgGuardrailPolicy>(`guardrail:${orgId}:${val}`, "json");
  if (raw) {
    policyCache.set(cacheKey, { policy: raw, expiresAt: Date.now() + POLICY_TTL_MS });
    return raw;
  }

  // KV miss — read-through to Postgres so a failed write-through doesn't silently
  // degrade a critical block/redact policy.
  try {
    const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data } = await sb
      .schema("inference")
      .from("guardrail_policies")
      .select("name, mode, rules")
      .eq("org_id", orgId)
      .eq("name", val)
      .maybeSingle();

    if (data) {
      const policy: OrgGuardrailPolicy = {
        name: data.name as string,
        mode: data.mode as GuardrailPolicy,
        rules: data.rules as GuardrailRule[],
      };
      void env.GUARDRAILS.put(`guardrail:${orgId}:${val}`, JSON.stringify(policy), {
        expirationTtl: 300,
      });
      policyCache.set(cacheKey, { policy, expiresAt: Date.now() + POLICY_TTL_MS });
      return policy;
    }
  } catch { /* Postgres fallback failed — degrade gracefully */ }

  return { name: val, mode: "warn", rules: [{ type: "jailbreak" }] };
}

// ─── Rule evaluator registry ──────────────────────────────────────────────────
//
// Each entry maps a rule type to a function that returns hits.
// To add a new rule type (e.g. "moderation" in S5):
//   1. Add to the GuardrailRule union above.
//   2. Register here: RULE_EVALUATORS.moderation = (texts, rule) => ...
//   3. evaluateOrgGuardrail will call it automatically.

type Msg = { role: string; content: unknown };
type RuleEvaluator = (texts: string[], rule: GuardrailRule, messages: Msg[]) => GuardrailHit[];

const RULE_EVALUATORS: Partial<Record<GuardrailRule["type"], RuleEvaluator>> = {
  jailbreak: (texts) => evaluateJailbreak(texts),
  pii: (texts, rule) => {
    const r = rule as Extract<GuardrailRule, { type: "pii" }>;
    return redactPii(texts.join(" "), r.categories).hits;
  },
  regex: (texts, rule) => {
    const r = rule as Extract<GuardrailRule, { type: "regex" }>;
    return evaluateRegex(texts, r);
  },
};

// ─── Policy evaluation ────────────────────────────────────────────────────────

/**
 * Evaluate an org policy against the request texts. Returns a decision and,
 * when mode="redact", a rewritten messages array with PII removed.
 * Callers must apply redactedMessages to the outgoing body when non-null.
 */
export function evaluateOrgGuardrail(
  texts: string[],
  messages: Msg[],
  policy: OrgGuardrailPolicy
): GuardrailDecision & { redactedMessages: Msg[] | null } {
  if (policy.mode === "off") {
    return { action: "clean", policy: "off", hits: [], redactedMessages: null };
  }

  const allHits: GuardrailHit[] = [];

  for (const rule of policy.rules) {
    const evaluator = RULE_EVALUATORS[rule.type];
    if (evaluator) {
      allHits.push(...evaluator(texts, rule, messages));
    }
    // Unknown rule types are silently skipped — forward-compat for new types
    // registered after this version was deployed.
  }

  if (allHits.length === 0) {
    return { action: "clean", policy: policy.mode, hits: [], redactedMessages: null };
  }

  const hasCritical = allHits.some((h) => h.severity === "critical");
  // Jailbreak/attack hits are critical but not PII — they cannot be sanitized by
  // redaction, so they block in both block and redact modes.
  const hasAttackCritical = allHits.some(
    (h) => h.severity === "critical" && !h.pattern_id.startsWith("pii_")
  );

  if (hasAttackCritical && (policy.mode === "block" || policy.mode === "redact")) {
    return { action: "blocked", policy: policy.mode, hits: allHits, redactedMessages: null };
  }

  // Block mode: PII hits are also blocking (no redaction, just reject).
  if (policy.mode === "block" && hasCritical) {
    return { action: "blocked", policy: policy.mode, hits: allHits, redactedMessages: null };
  }

  // Redact mode: rewrite user/system messages — PII removed before forwarding.
  if (policy.mode === "redact") {
    const piiRule = policy.rules.find(
      (r): r is Extract<GuardrailRule, { type: "pii" }> => r.type === "pii"
    );
    if (piiRule) {
      let mutated = false;
      const redacted = messages.map((m) => {
        if (m.role !== "user" && m.role !== "system") return m;
        if (typeof m.content !== "string") return m;
        const { text, hits: piiHits } = redactPii(m.content, piiRule.categories);
        if (piiHits.length > 0) mutated = true;
        return { ...m, content: text };
      });
      if (mutated) {
        return { action: "redacted", policy: policy.mode, hits: allHits, redactedMessages: redacted };
      }
    }
    return { action: "flagged", policy: policy.mode, hits: allHits, redactedMessages: null };
  }

  return { action: "flagged", policy: policy.mode, hits: allHits, redactedMessages: null };
}

// ─── Text extraction helpers ──────────────────────────────────────────────────

export function extractUserTextsFromOpenAI(
  messages: Array<{ role?: string; content?: unknown }> | undefined
): string[] {
  if (!messages) return [];
  const out: string[] = [];
  for (const m of messages) {
    if (m.role !== "user" && m.role !== "system") continue;
    if (typeof m.content === "string") {
      out.push(m.content);
    } else if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part && typeof part === "object" && "type" in part && (part as { type: string }).type === "text") {
          const text = (part as { text?: string }).text;
          if (typeof text === "string") out.push(text);
        }
      }
    }
  }
  return out;
}

export function extractUserTextsFromAnthropic(
  system: unknown,
  messages: Array<{ role?: string; content?: unknown }> | undefined
): string[] {
  const out: string[] = [];
  if (typeof system === "string") out.push(system);
  else if (Array.isArray(system)) {
    for (const part of system) {
      if (part && typeof part === "object" && "type" in part && (part as { type: string }).type === "text") {
        const text = (part as { text?: string }).text;
        if (typeof text === "string") out.push(text);
      }
    }
  }
  if (messages) {
    for (const m of messages) {
      if (m.role !== "user") continue;
      if (typeof m.content === "string") {
        out.push(m.content);
      } else if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (part && typeof part === "object" && "type" in part && (part as { type: string }).type === "text") {
            const text = (part as { text?: string }).text;
            if (typeof text === "string") out.push(text);
          }
        }
      }
    }
  }
  return out;
}
