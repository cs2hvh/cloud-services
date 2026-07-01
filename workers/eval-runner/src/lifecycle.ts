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
      await Promise.allSettled(batch.map((c) => processCase(ctx, job, c)));

      // Re-count from DB after each batch to get accurate numbers
      const { data: counts } = await supabase
        .schema("inference")
        .from("eval_results")
        .select("status, score")
        .eq("run_id", job.runId);

      completedCount = 0; failedCount = 0; totalScore = 0; scoredCount = 0;
      for (const r of counts ?? []) {
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
          heartbeat_at: new Date().toISOString(),
        })
        .eq("id", job.runId);

      log.info({ completed: completedCount, failed: failedCount, total: evalCases.length, avgScore }, "batch done");
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

async function processCase(ctx: RunContext, job: EvalJob, c: EvalCase): Promise<void> {
  const { env, supabase, logger } = ctx;
  const log = logger.child({ runId: job.runId, caseId: c.id });
  const startMs = Date.now();

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
        usage?: { total_tokens?: number };
      };
      output = data.choices?.[0]?.message?.content ?? "";
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
          job.scorerConfig.judge_model ?? "openai/gpt-4o-mini",
          job.scorerConfig.judge_prompt ?? null,
          env.inferenceBaseUrl,
          env.inferencePlatformKey,
          env.caseTimeoutMs
        );
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
        cost_cents: 0,
      })
      .eq("run_id", job.runId)
      .eq("case_id", c.id);

    log.debug({ score: scoreResult.score, latencyMs }, "case scored");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn({ err: msg }, "case failed");

    await supabase
      .schema("inference")
      .from("eval_results")
      .update({ status: "failed", error: msg, latency_ms: Date.now() - startMs })
      .eq("run_id", job.runId)
      .eq("case_id", c.id);
  }
}
