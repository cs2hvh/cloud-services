/**
 * Sandbox session settle (S3.2b) — the billing-side counterpart to
 * agentcore.sandbox_sessions. Closes a gap doc 13's "Code seams" table requires
 * but was never built: a real settle function, idempotent on the atomic
 * `provisioning|running → stopped` transition (mirrors settleServingPod /
 * computeProratedCharge in lib/billing/credits.ts) — a double-settle (dispose()
 * racing the idle reaper) can never double-charge, because only one caller wins
 * the row transition.
 *
 * ⚠️ This settle formula is duplicated (not shared) in
 * app/api/agents/internal/session-reaper/route.ts because that route runs in
 * the separate Next.js deployable, which cannot import from workers/agent-runner
 * (excluded from the root tsconfig; no cross-deployable import path exists —
 * same boundary doc 14 §2b documents for MCP). If you change this formula,
 * change it there too.
 *
 * ⚠️ Money-moving is intentionally DEFERRED. Doc 13 MUST §5 requires this to
 * "sit on Phase-0 hardened billing RPCs" and the cents_per_cpu_second rate is
 * still PENDING_FINANCE (20260701000003_agentcore_tool_pricing.sql). So this
 * computes and returns the would-be charge for audit/visibility but does NOT
 * call Billing.deduct — consistent with every other agent cost path today
 * (run_steps/runs record cost_cents for the trace + mid-run ceiling; nothing
 * charges real money until Phase-0 billing lands, doc 11 §9).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SettleResult {
  settled: boolean;
  seconds: number;
  wouldChargeCents: number;
}

export async function settleSandboxSession(
  supabase: SupabaseClient,
  sessionId: string
): Promise<SettleResult> {
  const stoppedAt = new Date().toISOString();
  // Win the transition atomically — only a still-live session matches, so a
  // concurrent settle (normal dispose() vs. the idle session-reaper) can't
  // double-process the same row.
  const { data: row } = await supabase
    .schema("agentcore")
    .from("sandbox_sessions")
    .update({ state: "stopped", stopped_at: stoppedAt })
    .eq("id", sessionId)
    .in("state", ["provisioning", "running"])
    .select("started_at, per_sec_cents")
    .maybeSingle<{ started_at: string | null; per_sec_cents: number }>();

  if (!row?.started_at) return { settled: false, seconds: 0, wouldChargeCents: 0 };

  const seconds = Math.max(0, (Date.parse(stoppedAt) - Date.parse(row.started_at)) / 1000);
  const wouldChargeCents = Math.round(Number(row.per_sec_cents) * seconds * 10_000) / 10_000;
  return { settled: true, seconds, wouldChargeCents };
}
