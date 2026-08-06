/**
 * GET /api/inference/traces/{traceId} — all spans that share a trace_id.
 *
 * A trace is a set of spans emitted for one logical operation — e.g. an agent
 * that calls chat → rerank → chat will have three spans under one trace_id.
 * Spans are returned chronologically (oldest first) so the caller can render
 * a waterfall.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> }
) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-trace-detail",
    limit: 120,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  const { traceId } = await params;
  if (!traceId) return NextResponse.json({ error: "traceId required" }, { status: 400 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data, error } = await supabase
    .schema("inference")
    .from("trace_spans")
    .select(
      "id, trace_id, parent_span_id, request_id, name, model_id, prompt_id, prompt_version, experiment_id, arm, input_tokens, output_tokens, latency_ms, ttft_ms, cost_cents, guardrail_action, status, payload_ref, attributes, created_at"
    )
    .eq("org_id", org.org_id)
    .eq("trace_id", traceId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const spans = data ?? [];

  // Compute trace-level totals
  let totalCost = 0;
  let totalLatency = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const s of spans) {
    totalCost += Number(s.cost_cents ?? 0);
    totalLatency += s.latency_ms ?? 0;
    totalInputTokens += s.input_tokens ?? 0;
    totalOutputTokens += s.output_tokens ?? 0;
  }

  return NextResponse.json({
    trace_id: traceId,
    span_count: spans.length,
    totals: {
      cost_cents: Math.round(totalCost * 100) / 100,
      total_latency_ms: totalLatency,
      input_tokens: totalInputTokens || null,
      output_tokens: totalOutputTokens || null,
    },
    spans,
  });
}
