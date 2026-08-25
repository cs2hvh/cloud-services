/**
 * Core eval run lifecycle.
 *
 * Flow:
 *   1. Atomic claim: queued → running (only one replica wins)
 *   2. Load all cases for the dataset
 *   3. Pre-insert 'pending' eval_results rows for this run
 *   4. Process cases concurrently (CONCURRENT_CASES at a time):
 *      a. Call target model via inference gateway
 *      b. Score output with the configured scorer
 *      c. Update eval_result row to 'completed' or 'failed'
 *      d. Bump run.heartbeat_at + aggregate counts
 *   5. Mark run as completed with avg_score; or failed on fatal error
 *
 * BILLING (on-behalf-of, 2026-07-15): found live — every target-model call
 * and every llm_judge call authenticated with the static
 * INFERENCE_PLATFORM_KEY but never asserted X-Ahura-On-Behalf-Of-Org, so
 * every eval run's real inference cost billed to whichever org owns that
 * platform key, never the customer who ran the eval — the exact
 * misattribution bug agent-runner had and fixed on 2026-07-06
 * (workers/agent-runner/src/gateway.ts), just never backported here. Both
 * calls now carry the header, and per-case cost_cents (previously hardcoded
 * to 0) is computed from real token usage × the target/judge models' own
 * catalog pricing, mirroring agent-runner's priceStep/fetchModelPricing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "pino";
import type { RunnerEnv } from "./env.js";
import type { EvalJob } from "./scan.js";
import { scoreExact, scoreContains, scoreRegex, scoreJsonSchema, scoreLlmJudge } from "./scorer.js";

interface EvalCase {
  id: string;
  input: Array<{ role: string; content: string }>;
  expected: string | null;
}

interface RunContext {
  env: RunnerEnv;
  supabase: SupabaseClient;
  logger: Logger;
}

interface ModelPricing {
  input_cents_per_mtok?: number;
  output_cents_per_mtok?: number;
}

interface CasePricing {
  targetPricing: ModelPricing;
  judgeModel: string | null;
  judgePricing: ModelPricing | null;
}

async function fetchModelPricing(supabase: SupabaseClient, modelId: string): Promise<ModelPricing> {
  const { data } = await supabase
    .schema("inference")
    .from("models")
    .select("pricing")
    .eq("model_id", modelId)
    .maybeSingle<{ pricing: ModelPricing }>();
  return data?.pricing ?? {};
}

/** Fractional cents from token counts × per-million-token catalog rates —
 *  same formula as agent-runner's priceStep model branch. */
function computeCostCents(pricing: ModelPricing, inputTokens: number, outputTokens: number): number {
  const inRate = pricing.input_cents_per_mtok ?? 0;
  const outRate = pricing.output_cents_per_mtok ?? 0;
  return (inputTokens * inRate + outputTokens * outRate) / 1_000_000;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export async function runEval(ctx: RunContext, job: EvalJob): Promise<void> {
  const { env, supabase, logger } = ctx;
  const log = logger.child({ runId: job.runId, modelId: job.modelId });

  // ── 1. Atomic claim ─────────────────────────────────────────────────────────
  const { data: claimed } = await supabase
    .schema("inference")
    .from("eval_runs")
    .update({ status: "running", heartbeat_at: new Date().toISOString() })
    .eq("id", job.runId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle<{ id: string }>();

  if (!claimed) {
    log.info("run already claimed by another replica — skipping");
    return;
  }

  log.info("claimed eval run");

  try {
    // ── 2. Load cases ──────────────────────────────────────────────────────────
    const { data: cases, error: casesErr } = await supabase
      .schema("inference")
      .from("eval_cases")
      .select("id, input, expected")
      .eq("dataset_id", job.datasetId)
      .order("created_at", { ascending: true });

    if (casesErr || !cases || cases.length === 0) {
      throw new Error(casesErr?.message ?? "No cases found for dataset");
    }

    const evalCases = cases as EvalCase[];
    log.info({ caseCount: evalCases.length }, "loaded cases");

    // ── 2b. Pricing for this run's target + (if used) judge model ───────────────
    // Fetched in parallel — independent reads, no reason to serialize them
    // ahead of every case in the run.
    const judgeModel =
      job.scorerType === "llm_judge" ? ((job.scorerConfig.judge_model as string | undefined) ?? "openai/gpt-4o-mini") : null;
    const [targetPricing, judgePricing] = await Promise.all([
      fetchModelPricing(supabase, job.modelId),
      judgeModel ? fetchModelPricing(supabase, judgeModel) : Promise.resolve(null),
    ]);
    // A pricing-catalog miss (typo'd judge_model, deactivated model) used to
    // silently compute $0 cost with nothing to distinguish it from a
    // genuinely free model — found in review, 2026-07-15. Not fatal (the run
    // still needs to proceed best-effort), but now at least visible in logs.
    if (!targetPricing.input_cents_per_mtok && !targetPricing.output_cents_per_mtok) {
      log.warn({ modelId: job.modelId }, "no pricing found for target model — cost will report as $0");
    }
    if (judgeModel && !judgePricing?.input_cents_per_mtok && !judgePricing?.output_cents_per_mtok) {
      log.warn({ judgeModel }, "no pricing found for judge model — cost will report as $0");
    }
    const pricing: CasePricing = { targetPricing, judgeModel, judgePricing };

    // ── 3. Pre-insert pending result rows ──────────────────────────────────────
    const pendingRows = evalCases.map((c) => ({
      run_id: job.runId,
      case_id: c.id,
      org_id: job.orgId,
      status: "pending",
    }));

    await supabase
      .schema("inference")
      .from("eval_results")
      .upsert(pendingRows, { onConflict: "run_id,case_id", ignoreDuplicates: true });

    // ── 4. Process cases in batches ────────────────────────────────────────────
    let completedCount = 0;
    let failedCount = 0;
    let totalScore = 0;
    let scoredCount = 0;
    let totalCostCents = 0;

    const batchSize = env.concurrentCases;
    for (let i = 0; i < evalCases.length; i += batchSize) {
      // Check for cancellation before each batch
      const { data: runCheck } = await supabase
        .schema("inference")
        .from("eval_runs")
        .select("status")
        .eq("id", job.runId)
        .maybeSingle<{ status: string }>();

      if (runCheck?.status === "cancelled") {
        log.info("run cancelled — stopping");
        return;
      }

      const batch = evalCases.slice(i, i + batchSize);
      await Promise.allSettled(batch.map((c) => processCase(ctx, job, c, pricing)));

      // Re-count from DB after each batch to get accurate numbers
      const { data: counts } = await supabase
        .schema("inference")
        .from("eval_results")
        .select("status, score, cost_cents")
        .eq("run_id", job.runId);

      completedCount = 0; failedCount = 0; totalScore = 0; scoredCount = 0; totalCostCents = 0;
      for (const r of counts ?? []) {
        totalCostCents += Number(r.cost_cents ?? 0);
        if (r.status === "completed") {
          completedCount++;
          if (r.score != null) { totalScore += Number(r.score); scoredCount++; }
        } else if (r.status === "failed") {
          failedCount++;
        }
      }

      const avgScore = scoredCount > 0 ? totalScore / scoredCount : null;

      await supabase
        .schema("inference")
        .from("eval_runs")
        .update({
          completed_cases: completedCount,
          failed_cases: failedCount,
          avg_score: avgScore,
          cost_cents: round4(totalCostCents),
          heartbeat_at: new Date().toISOString(),
        })
        .eq("id", job.runId);

      log.info({ completed: completedCount, failed: failedCount, total: evalCases.length, avgScore, totalCostCents }, "batch done");
    }

    // ── 5. Mark completed ──────────────────────────────────────────────────────
    const finalAvg = scoredCount > 0 ? totalScore / scoredCount : null;
    await supabase
      .schema("inference")
      .from("eval_runs")
      .update({
        status: "completed",
        completed_cases: completedCount,
        failed_cases: failedCount,
        avg_score: finalAvg,
        cost_cents: round4(totalCostCents),
      })
      .eq("id", job.runId);

    log.info({ completedCount, failedCount, finalAvg }, "eval run completed");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ err: msg }, "eval run failed");

    await supabase
      .schema("inference")
      .from("eval_runs")
      .update({ status: "failed", error: msg })
      .eq("id", job.runId);
  }
}

async function processCase(ctx: RunContext, job: EvalJob, c: EvalCase, pricing: CasePricing): Promise<void> {
  const { env, supabase, logger } = ctx;
  const log = logger.child({ runId: job.runId, caseId: c.id });
  const startMs = Date.now();

  // Hoisted above the try block (found in review, 2026-07-15): the target-model
  // call can succeed — real spend already incurred and attributed via the
  // on-behalf-of header — and then a *later* step (scoring, the DB write) can
  // still throw. If these lived inside the try, the catch block below would
  // have no way to persist the cost that was genuinely already spent, and
  // eval_runs.cost_cents would permanently under-report actual spend.
  let targetCostCents = 0;
  let judgeCostCents = 0;

  try {
    // Call target model
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.caseTimeoutMs);

    let output: string;

    try {
      const res = await fetch(`${env.inferenceBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.inferencePlatformKey}`,
          "Content-Type": "application/json",
          "X-Ahura-On-Behalf-Of-Org": job.orgId,
        },
        body: JSON.stringify({
          model: job.modelId,
          messages: c.input,
          max_tokens: 2048,
          temperature: 0,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Target model returned HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      output = data.choices?.[0]?.message?.content ?? "";
      targetCostCents = computeCostCents(
        pricing.targetPricing,
        data.usage?.prompt_tokens ?? 0,
        data.usage?.completion_tokens ?? 0
      );
    } finally {
      clearTimeout(timer);
    }

    const latencyMs = Date.now() - startMs;

    // Score the output
    let scoreResult;
    switch (job.scorerType) {
      case "exact":
        scoreResult = scoreExact(output, c.expected);
        break;
      case "contains":
        scoreResult = scoreContains(output, c.expected);
        break;
      case "regex":
        scoreResult = scoreRegex(output, job.scorerConfig.pattern as string | undefined);
        break;
      case "json_schema":
        scoreResult = scoreJsonSchema(output, job.scorerConfig.schema as Record<string, unknown> | undefined);
        break;
      case "llm_judge":
      default:
        scoreResult = await scoreLlmJudge(
          output,
          c.expected,
          c.input,
          pricing.judgeModel ?? "openai/gpt-4o-mini",
          (job.scorerConfig.judge_prompt as string | undefined) ?? null,
          env.inferenceBaseUrl,
          env.inferencePlatformKey,
          env.caseTimeoutMs,
          job.orgId
        );
        if (scoreResult.usage && pricing.judgePricing) {
          judgeCostCents = computeCostCents(pricing.judgePricing, scoreResult.usage.inputTokens, scoreResult.usage.outputTokens);
        }
        break;
    }

    await supabase
      .schema("inference")
      .from("eval_results")
      .update({
        output,
        score: scoreResult.score,
        passed: scoreResult.score >= 0.5,
        scorer_reasoning: scoreResult.reasoning,
        status: "completed",
        latency_ms: latencyMs,
        cost_cents: round4(targetCostCents + judgeCostCents),
      })
      .eq("run_id", job.runId)
      .eq("case_id", c.id);

    log.debug({ score: scoreResult.score, latencyMs }, "case scored");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg }, "case failed");

    // Persist whatever cost was already genuinely incurred (e.g. the
    // target-model call succeeded and was billed via the on-behalf-of header,
    // but scoring or this very DB write threw afterward) — a failed case is
    // not a free one.
    await supabase
      .schema("inference")
      .from("eval_results")
      .update({
        status: "failed",
        error: msg,
        latency_ms: Date.now() - startMs,
        cost_cents: round4(targetCostCents + judgeCostCents),
      })
      .eq("run_id", job.runId)
      .eq("case_id", c.id);
  }
}
