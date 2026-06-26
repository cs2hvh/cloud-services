/**
 * POST /api/inference/guardrails/test — dry-run a guardrail policy against text.
 *
 * Runs evaluation via the shared lib/guardrail-eval primitives — the same
 * functions the CF Worker uses — so results always match gateway behaviour.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/auth/server-auth";
import { limitByUser } from "@/lib/cooldown/userbased";
import { getOrBootstrapOrgForUser } from "@/lib/inference/orgs";
import { ruleSchema, type RuleInput } from "@/lib/inference/guardrail-rules";
import {
  evaluateJailbreak,
  evaluateRegex,
  redactPii,
  type GuardrailHit,
  type PiiCategory,
} from "@/lib/guardrail-eval";

const schema = z.object({
  text: z.string().min(1).max(10_000),
  policy_id: z.string().uuid().optional(),
  mode: z.enum(["off", "warn", "block", "redact"]).optional(),
  rules: z.array(ruleSchema).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const rl = await limitByUser(auth.user!.id, { prefix: "rl:guardrail-test", limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation error", details: parsed.error.issues }, { status: 400 });
  }

  let org;
  try {
    org = await getOrBootstrapOrgForUser(auth.user!.id, auth.user!.email ?? "");
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Org error" }, { status: 500 });
  }

  let mode = parsed.data.mode ?? "warn";
  let rules: RuleInput[] = parsed.data.rules ?? [{ type: "jailbreak" }];

  if (parsed.data.policy_id) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );
    const { data } = await supabase
      .schema("inference")
      .from("guardrail_policies")
      .select("mode, rules")
      .eq("id", parsed.data.policy_id)
      .eq("org_id", org.org_id)
      .single();
    if (!data) return NextResponse.json({ error: "Policy not found" }, { status: 404 });
    mode = data.mode as typeof mode;
    rules = data.rules as RuleInput[];
  }

  if (mode === "off") {
    return NextResponse.json({ success: true, action: "clean", hits: [] });
  }

  const texts = [parsed.data.text];
  const allHits: GuardrailHit[] = [];
  let redactedText = parsed.data.text;

  for (const rule of rules) {
    if (rule.type === "jailbreak") {
      allHits.push(...evaluateJailbreak(texts));
    } else if (rule.type === "pii") {
      const result = redactPii(redactedText, rule.categories as PiiCategory[]);
      allHits.push(...result.hits);
      redactedText = result.text;
    } else if (rule.type === "regex") {
      allHits.push(...evaluateRegex(texts, rule));
    }
    // Unknown rule types are skipped — forward-compat for S5+
  }

  const hasCritical = allHits.some((h) => h.severity === "critical");
  const hasAttackCritical = allHits.some(
    (h) => h.severity === "critical" && !h.pattern_id.startsWith("pii_")
  );
  let action = "clean";
  if (allHits.length > 0) {
    if (hasAttackCritical && (mode === "block" || mode === "redact")) action = "blocked";
    else if (mode === "block" && hasCritical) action = "blocked";
    else if (mode === "redact" && allHits.some((h) => h.pattern_id.startsWith("pii_"))) action = "redacted";
    else action = "flagged";
  }

  return NextResponse.json({
    success: true,
    action,
    hits: allHits,
    redacted_text: mode === "redact" ? redactedText : undefined,
  });
}
