/**
 * GET /api/inference/traces — paginated trace spans for the caller's org.
 *
 * Each span is one gateway request (chat, embed, image, audio, rerank, moderation).
 * Spans are written by the CF Worker's TRACE_EVENTS consumer into
 * inference.trace_spans (partitioned monthly).
 *
 * Query params:
 *   ?limit=N               page size (default 50, max 2000)
 *   ?before=ISO            keyset cursor — return rows older than this timestamp
 *   ?from=ISO              lower bound on created_at (inclusive)
 *   ?to=ISO                upper bound on created_at (inclusive)
 *   ?name=gen_ai.*         filter by span name
 *   ?status=success        filter by status
 *   ?guardrail=blocked     filter by guardrail_action
 *   ?model=...             partial match on model_id
 *   ?prompt_version=N      exact match on prompt_version
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { controlPlaneAuth } from "@/lib/inference/control-plane-auth";
import { limitByUser } from "@/lib/cooldown/userbased";

interface TraceRow {
  id: string;
  trace_id: string;
  request_id: string;
  name: string;
  model_id: string | null;
  prompt_id: string | null;
  prompt_version: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  ttft_ms: number | null;
  cost_cents: number | null;
  guardrail_action: string | null;
  status: string;
  attributes: Record<string, unknown>;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const authResult = await controlPlaneAuth(request, { session: "cookie", requireOrgKey: true });
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;

  const rl = await limitByUser(auth.subject, {
    prefix: "rl:inf-traces",
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });

  const org = { org_id: auth.orgId, role: auth.orgRole };

  const params = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number.parseInt(params.get("limit") ?? "50", 10) || 50, 1), 2000);
  const before = params.get("before");
  const from = params.get("from");
  const to = params.get("to");
  const nameFilter = params.get("name");
  const statusFilter = params.get("status");
  const guardrailFilter = params.get("guardrail");
  const modelFilter = params.get("model");
  const promptVersionFilter = params.get("prompt_version");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  let q = supabase
    .schema("inference")
    .from("trace_spans")
    .select(
      "id, trace_id, request_id, name, model_id, prompt_id, prompt_version, input_tokens, output_tokens, latency_ms, ttft_ms, cost_cents, guardrail_action, status, attributes, created_at"
    )
    .eq("org_id", org.org_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) q = q.lt("created_at", before);
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to);
  if (nameFilter) q = q.eq("name", nameFilter);
  if (statusFilter) q = q.eq("status", statusFilter);
  if (guardrailFilter) q = q.eq("guardrail_action", guardrailFilter);
  if (modelFilter) q = q.ilike("model_id", `%${modelFilter}%`);
  if (promptVersionFilter) q = q.eq("prompt_version", parseInt(promptVersionFilter, 10));

  const { data, error } = await q.returns<TraceRow[]>();

  if (error) {
    console.error("[Inference Traces] fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch traces" }, { status: 500 });
  }

  const rows = data ?? [];

  // Compute summary stats from the returned page
  let totalLatency = 0;
  let latencyCount = 0;
  let blockedCount = 0;
  let errorCount = 0;
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const latencies: number[] = [];

  for (const r of rows) {
    if (r.latency_ms != null) {
      totalLatency += r.latency_ms;
      latencyCount++;
      latencies.push(r.latency_ms);
    }
    if (r.guardrail_action === "blocked") blockedCount++;
    if (r.status.startsWith("error_") || r.status === "cancelled") errorCount++;
    if (r.cost_cents != null) totalCost += Number(r.cost_cents);
    if (r.input_tokens != null) totalInputTokens += r.input_tokens;
    if (r.output_tokens != null) totalOutputTokens += r.output_tokens;
  }

  latencies.sort((a, b) => a - b);
  const p99Latency = latencies[Math.floor(latencies.length * 0.99)] ?? null;
  const avgLatency = latencyCount > 0 ? Math.round(totalLatency / latencyCount) : null;

  return NextResponse.json({
    success: true,
    summary: {
      shown: rows.length,
      avg_latency_ms: avgLatency,
      p99_latency_ms: p99Latency,
      blocked_count: blockedCount,
      blocked_pct: rows.length > 0 ? Math.round((blockedCount / rows.length) * 100) : 0,
      error_count: errorCount,
      total_cost_cents: Math.round(totalCost * 1000) / 1000,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
    },
    data: rows,
    next_before: rows.length === limit ? (rows[rows.length - 1]?.created_at ?? null) : null,
  });
}
