/**
 * Prompt-injection guardrail for the inference gateway.
 *
 * Runs after request parsing in the chat-completions and messages routes,
 * scans the concatenated text of system + user messages against a static
 * pattern set, and returns a GuardrailDecision the route uses to either
 * (a) annotate the response with X-Ahura-Guardrail: flagged, or (b) reject
 * the request with 400 (when policy is "block" AND any critical hit fires).
 *
 * v1 detection is regex-based and intentionally conservative — we'd rather
 * miss a clever attempt than block a legitimate prompt that happens to
 * mention "ignore the". A future v2 could pipe the text through a small
 * Cloudflare Workers AI classifier when policy=block.
 *
 * Policy is request-scoped via the X-Ahura-Guardrail header:
 *   off   — skip entirely
 *   warn  — detect + annotate, never reject (DEFAULT, safe to roll out)
 *   block — detect + reject on any "critical" severity hit
 *
 * Why default warn: turning on block globally without telemetry would
 * cause user-visible regressions. warn lets us gather data on false-
 * positive rates per pattern before flipping policy by-org.
 */

export type GuardrailPolicy = "off" | "warn" | "block";

export type GuardrailSeverity = "critical" | "soft";

export interface GuardrailHit {
  pattern_id: string;
  severity: GuardrailSeverity;
  /** Short snippet of the matched text (truncated, for audit log). */
  excerpt: string;
}

export type GuardrailAction = "clean" | "flagged" | "blocked";

export interface GuardrailDecision {
  action: GuardrailAction;
  policy: GuardrailPolicy;
  hits: GuardrailHit[];
}

// ─── Pattern set ──────────────────────────────────────────────────
// Each pattern aims for high precision — we'd rather miss a clever
// jailbreak than flag a legitimate prompt. Severity guides policy:
//   critical → triggers a block in policy=block
//   soft     → annotation only

interface PatternDef {
  id: string;
  severity: GuardrailSeverity;
  re: RegExp;
}

const PATTERNS: PatternDef[] = [
  // Classic instruction-override phrasing
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
  // Role-injection: smuggling a system message inside a user turn
  {
    id: "role_injection_system",
    severity: "critical",
    re: /(^|\n)\s*system\s*:\s*you\b/i,
  },
  // ChatML / Llama tag smuggling
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
  // Jailbreak personas
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
  // Data-exfil framings (asking the model to reveal its system prompt)
  {
    id: "reveal_system_prompt",
    severity: "soft",
    re: /\b(reveal|show|print|repeat|output)\s+(your|the)\s+(system|initial|original)\s+(prompt|instructions?|message)\b/i,
  },
  // Suspicious base64-looking blob in user text (≥120 chars of [A-Za-z0-9+/=])
  // Long enough to plausibly hide a payload; short enough to skip code paste.
  {
    id: "long_base64_blob",
    severity: "soft",
    re: /[A-Za-z0-9+/]{120,}={0,2}/,
  },
];

// ─── API ──────────────────────────────────────────────────────────

export function parseGuardrailPolicy(headerValue: string | null | undefined): GuardrailPolicy {
  const v = headerValue?.toLowerCase().trim();
  if (v === "off" || v === "block" || v === "warn") return v;
  return "warn";
}

/**
 * Evaluate guardrail on the concatenated text of all user-controlled
 * fields in the request. Skips system text if `skipSystem` is true (some
 * callers pass a server-rendered system prompt that we trust).
 */
export function evaluateGuardrail(
  texts: Array<string | null | undefined>,
  policy: GuardrailPolicy
): GuardrailDecision {
  if (policy === "off") {
    return { action: "clean", policy, hits: [] };
  }

  const hits: GuardrailHit[] = [];
  for (const raw of texts) {
    if (!raw) continue;
    for (const p of PATTERNS) {
      const m = raw.match(p.re);
      if (m) {
        hits.push({
          pattern_id: p.id,
          severity: p.severity,
          excerpt: truncate(m[0], 120),
        });
      }
    }
  }

  if (hits.length === 0) {
    return { action: "clean", policy, hits: [] };
  }

  const hasCritical = hits.some((h) => h.severity === "critical");
  if (policy === "block" && hasCritical) {
    return { action: "blocked", policy, hits };
  }
  return { action: "flagged", policy, hits };
}

/**
 * Extract user-controlled text from an OpenAI-style messages array.
 * Returns one string per message content. Skips assistant + tool messages
 * (those are server/model outputs, not user input).
 */
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

/**
 * Same as extractUserTextsFromOpenAI but for Anthropic message shape
 * (system as separate field, user/assistant messages with text blocks).
 */
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

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}
