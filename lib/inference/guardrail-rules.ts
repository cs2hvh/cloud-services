/**
 * Shared Zod schema for guardrail policy rules.
 *
 * Single definition used by both policy CRUD routes (create + patch).
 * PII categories are derived from PII_CATEGORY_LIST so adding a new
 * category in lib/guardrail-eval.ts automatically extends validation here.
 */
import { z } from "zod";
import { PII_CATEGORY_LIST } from "@/lib/guardrail-eval";

// z.enum requires a non-empty tuple literal, so derive it from the canonical list.
const piiCategoryEnum = z.enum(
  PII_CATEGORY_LIST as [string, ...string[]]
);

export const ruleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("jailbreak") }),
  z.object({
    type: z.literal("pii"),
    categories: z.array(piiCategoryEnum).min(1),
  }),
  z.object({
    type: z.literal("regex"),
    pattern: z.string().min(1).max(500),
    flags: z.string().max(10).optional(),
    severity: z.enum(["critical", "soft"]),
    id: z.string().max(80).optional(),
  }),
]);

export type RuleInput = z.infer<typeof ruleSchema>;

export const POLICY_MODE = ["off", "warn", "block", "redact"] as const;
export type PolicyMode = (typeof POLICY_MODE)[number];
