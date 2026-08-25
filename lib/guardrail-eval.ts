/**
 * Pure guardrail evaluation primitives — no platform-specific dependencies.
 *
 * This is the single source of truth for pattern definitions and evaluation
 * logic. Both the CF Worker (workers/inference/src/lib/guardrail.ts) and the
 * Next.js control plane (app/api/inference/guardrails/test/route.ts) import
 * from here so they are always in sync.
 *
 * Adding a new jailbreak pattern, PII category, or rule type: change this
 * file only. No other file needs to be touched.
 */

// ─── Shared types ─────────────────────────────────────────────────────────────

export type GuardrailSeverity = "critical" | "soft";

export type PiiCategory =
  | "email"
  | "phone"
  | "ssn"
  | "card"
  | "api_key"
  | "iban";

/** Canonical list — used by Zod schemas and the dashboard PII category picker. */
export const PII_CATEGORY_LIST: PiiCategory[] = [
  "email",
  "phone",
  "ssn",
  "card",
  "api_key",
  "iban",
];

export interface GuardrailHit {
  pattern_id: string;
  severity: GuardrailSeverity;
  /** Short snippet of the matched text (truncated, for audit log). */
  excerpt: string;
}

export interface RegexRuleDef {
  pattern: string;
  flags?: string;
  severity: GuardrailSeverity;
  id?: string;
}

// ─── Jailbreak patterns ───────────────────────────────────────────────────────

interface PatternDef {
  id: string;
  severity: GuardrailSeverity;
  re: RegExp;
}

export const JAILBREAK_PATTERNS: PatternDef[] = [
  {
    id: "ignore_previous",
    severity: "critical",
    re: /\bignore\s+(all\s+|the\s+|any\s+)?(previous|prior|preceding|above)\s+(instruction|prompt|rule|message)s?\b/i,
  },
  {
    id: "disregard_above",
    severity: "critical",
    re: /\b(disregard|forget)\s+(the\s+|all\s+|any\s+)?(above|previous|prior|preceding)\s+(instruction|context|message|rule)s?\b/i,
  },
  {
    id: "role_injection_system",
    severity: "critical",
    re: /(^|\n)\s*system\s*:\s*you\b/i,
  },
  {
    id: "chatml_token_leak",
    severity: "critical",
    re: /<\|(im_start|im_end|endoftext)\|>/,
  },
  {
    id: "llama_inst_tag",
    severity: "soft",
    re: /\[\s*\/?\s*INST\s*\]/,
  },
  {
    id: "llama_sys_tag",
    severity: "soft",
    re: /<<\s*\/?\s*SYS\s*>>/i,
  },
  {
    id: "dan_jailbreak",
    severity: "critical",
    re: /\b(DAN|do\s+anything\s+now|jailbroken|developer\s+mode\s+enabled)\b/i,
  },
  {
    id: "unrestricted_persona",
    severity: "critical",
    re: /\byou\s+(are|are\s+now|will\s+now\s+be)\s+(an?\s+)?(unrestricted|uncensored|unfiltered|amoral)\b/i,
  },
  {
    id: "no_rules",
    severity: "critical",
    re: /\b(no|without)\s+(rules?|restrictions?|filters?|guidelines?|limitations?)\b.{0,40}\b(apply|exist|allowed)\b/i,
  },
  {
    id: "reveal_system_prompt",
    severity: "soft",
    re: /\b(reveal|show|print|repeat|output)\s+(your|the)\s+(system|initial|original)\s+(prompt|instructions?|message)\b/i,
  },
  {
    id: "long_base64_blob",
    severity: "soft",
    re: /[A-Za-z0-9+/]{120,}={0,2}/,
  },
];

// ─── PII patterns ──────────────────────────────────────────────────────────────

export const PII_PATTERNS: Record<PiiCategory, { re: RegExp; label: string }> = {
  email:   { re: /[\w.+%-]+@[\w-]+\.[A-Za-z]{2,}/g,                              label: "[EMAIL_REDACTED]" },
  phone:   { re: /\+?[\d][\d\s\-().]{8,}\d/g,                                    label: "[PHONE_REDACTED]" },
  ssn:     { re: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g,                               label: "[SSN_REDACTED]" },
  card:    { re: /\b(?:\d[ -]?){13,16}\b/g,                                       label: "[CARD_REDACTED]" },
  api_key: { re: /\b(?:sk|rk|pk|api)[_-][A-Za-z0-9]{16,}\b/gi,                   label: "[API_KEY_REDACTED]" },
  iban:    { re: /\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}[A-Z0-9]{0,16}\b/g,            label: "[IBAN_REDACTED]" },
};

// ─── Evaluation functions ──────────────────────────────────────────────────────

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}

/** Run all jailbreak patterns against a list of text strings. */
export function evaluateJailbreak(texts: string[]): GuardrailHit[] {
  const hits: GuardrailHit[] = [];
  for (const text of texts) {
    if (!text) continue;
    for (const p of JAILBREAK_PATTERNS) {
      const m = text.match(p.re);
      if (m) {
        hits.push({ pattern_id: p.id, severity: p.severity, excerpt: truncate(m[0], 120) });
      }
    }
  }
  return hits;
}

/**
 * Redact PII from a single string. Returns the (possibly mutated) string and
 * any hits found. Categories are processed in order; earlier redactions are
 * visible to later patterns.
 */
export function redactPii(
  text: string,
  categories: PiiCategory[]
): { text: string; hits: GuardrailHit[] } {
  let out = text;
  const hits: GuardrailHit[] = [];
  for (const cat of categories) {
    const def = PII_PATTERNS[cat];
    if (!def) continue;
    const matches = out.match(def.re);
    if (matches) {
      for (const m of matches) {
        hits.push({ pattern_id: `pii_${cat}`, severity: "critical", excerpt: truncate(m, 40) });
      }
      out = out.replace(def.re, def.label);
    }
  }
  return { text: out, hits };
}

/** Evaluate a custom regex rule against a list of texts. */
export function evaluateRegex(texts: string[], rule: RegexRuleDef): GuardrailHit[] {
  const hits: GuardrailHit[] = [];
  try {
    const re = new RegExp(rule.pattern, rule.flags ?? "i");
    for (const text of texts) {
      const m = text.match(re);
      if (m) {
        hits.push({
          pattern_id: rule.id ?? "custom_regex",
          severity: rule.severity,
          excerpt: truncate(m[0], 120),
        });
      }
    }
  } catch { /* invalid regex — skip */ }
  return hits;
}
