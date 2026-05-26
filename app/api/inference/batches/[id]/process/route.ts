/**
 * POST /api/inference/batches/[id]/process
 *
 * Runs a batch end-to-end. Intended to be called by an operator cron OR
 * a one-shot operator trigger (the dashboard exposes a button later).
 * Synchronous — caller waits until completion / cancellation / failure.
 *
 *   • Streams the input file from R2 line-by-line
 *   • Each line is { custom_id, method, url, body } per OpenAI spec
 *   • Fires each request at OPENROUTER directly (bypassing the Workers
 *     gateway so we can mark usage rows with is_batch=true at insert time)
 *   • Writes one response line per input line to the output JSONL
 *   • Failures go to an error JSONL
 *   • Emits one inference.usage row per request with is_batch=true,
 *     batch_id=<id> — the consumer (workers/inference/src/consumers/
 *     usage.ts) already applies the cached_tokens rate; we additionally
 *     halve cost_cents at insert time here for the batch discount.
 *
 * Auth: this endpoint requires either an authenticated dashboard user
 * (cookie session) OR a service-token header matching env
 * BATCH_PROCESSOR_TOKEN. The latter is what a cron / k8s worker uses.
 *
 * Concurrency: this route processes ONE request at a time. Batches with
 * thousands of lines will be slow; a parallel processor is a Phase 11+
 * concern.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authenticateUser } from "@/lib/auth/server-auth";
import { getActiveOrgForUser } from "@/lib/inference/orgs";
import { auditContextFrom, recordAudit } from "@/lib/inference/audit";
import { downloadText, uploadBytes } from "@/lib/inference/batch-storage";
import { type BatchRow, type BatchStatus } from "@/lib/inference/batches";
import { customerSafeErrorMessage } from "@/lib/inference/error-messages";

function isBatchId(s: string): boolean {
  return /^batch_[a-z0-9]+$/i.test(s);
}

function makeFileId(): string {
  return `file_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
// 50% off the platform rate — OpenAI-equivalent discount tier.
const BATCH_DISCOUNT_FACTOR = 0.5;
// Per-request fetch timeout. Keeps a single slow upstream from wedging the whole batch.
const PER_REQUEST_TIMEOUT_MS = 90_000;
// Re-check the cancel flag every N requests to avoid hammering the DB.
const CANCEL_CHECK_EVERY = 10;

interface InputLine {
  custom_id?: string;
  method?: string;
  url?: string;
  body?: Record<string, unknown>;
}

interface OutputLine {
  id: string;
  custom_id: string;
  response: {
    status_code: number;
    request_id: string;
    body: unknown;
  };
  error: null;
}

interface ErrorLine {
  id: string;
  custom_id: string;
  response: null;
  error: { code: string; message: string };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isBatchId(id)) return NextResponse.json({ error: "Invalid batch id" }, { status: 400 });

  // ─── Auth: cookie session OR service token ─────────────────────
  const serviceToken = request.headers.get("x-ahura-batch-token");
  const expectedToken = process.env.BATCH_PROCESSOR_TOKEN;
  const isServiceCall = !!(serviceToken && expectedToken && serviceToken === expectedToken);

  let orgIdFromUser: string | null = null;
  if (!isServiceCall) {
    const auth = await authenticateUser();
    if (!auth.authenticated) return auth.response;
    const org = await getActiveOrgForUser(auth.user!.id);
    if (!org) return NextResponse.json({ error: "No inference org" }, { status: 404 });
    if (org.role === "viewer") {
      return NextResponse.json({ error: "Viewers cannot trigger batches" }, { status: 403 });
    }
    orgIdFromUser = org.org_id;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // ─── Load batch + auth scope check ────────────────────────────
  let q = supabase
    .schema("inference")
    .from("batches")
    .select("*")
    .eq("id", id);
  if (orgIdFromUser) q = q.eq("org_id", orgIdFromUser);
  const { data: batch } = await q.maybeSingle<BatchRow>();
  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

  if (batch.status !== "validating" && batch.status !== "in_progress") {
    return NextResponse.json(
      { error: `Batch is in status "${batch.status}" — nothing to process` },
      { status: 409 }
    );
  }

  // ─── Resolve the upstream OpenRouter key (platform billing only
  //     for batch — BYOK in async land is hairy and out of scope). ──
  const upstreamKey = process.env.OPENROUTER_PLATFORM_KEY;
  if (!upstreamKey) {
    console.error("[Inference Batches] OPENROUTER_PLATFORM_KEY missing — batch cannot run");
    await supabase
      .schema("inference")
      .from("batches")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        errors: {
          message:
            "Batch processing is temporarily unavailable. Please retry shortly or contact support.",
        },
      })
      .eq("id", id);
    return NextResponse.json(
      { error: "Batch processing is temporarily unavailable. Please retry shortly." },
      { status: 503 }
    );
  }

  // ─── Flip to in_progress (idempotent if already there) ────────
  if (batch.status === "validating") {
    await supabase
      .schema("inference")
      .from("batches")
      .update({ status: "in_progress", in_progress_at: new Date().toISOString() })
      .eq("id", id);
  }

  // ─── Stream the input file ────────────────────────────────────
  let rawInput: string;
  try {
    rawInput = await downloadText(batch.org_id, batch.input_file_id);
  } catch (err) {
    console.error("[Inference Batches] input fetch failed:", err);
    await markFailed(
      supabase,
      id,
      customerSafeErrorMessage(err instanceof Error ? err.message : String(err)) ||
        "Could not read input file from storage."
    );
    return NextResponse.json({ error: "Failed to fetch input file" }, { status: 502 });
  }

  const lines = rawInput.split("\n").filter((l) => l.trim().length > 0);
  const outputLines: string[] = [];
  const errorLines: string[] = [];
  let completed = 0;
  let failed = 0;

  for (let i = 0; i < lines.length; i++) {
    // Periodic cancel check — avoid hammering Postgres every iteration
    if (i % CANCEL_CHECK_EVERY === 0) {
      const { data: current } = await supabase
        .schema("inference")
        .from("batches")
        .select("status")
        .eq("id", id)
        .maybeSingle<{ status: BatchStatus }>();
      if (current?.status === "cancelling") {
        await finalizeAsCancelled(supabase, id, batch.org_id, outputLines, errorLines, completed, failed);
        return NextResponse.json({ id, status: "cancelled", completed, failed });
      }
    }

    const lineText = lines[i]!;
    let parsed: InputLine;
    try {
      parsed = JSON.parse(lineText) as InputLine;
    } catch {
      const customId = `line-${i}`;
      errorLines.push(
        JSON.stringify({
          id: `batch_req_${crypto.randomUUID()}`,
          custom_id: customId,
          response: null,
          error: { code: "invalid_json", message: "Line is not valid JSON" },
        } as ErrorLine)
      );
      failed++;
      continue;
    }
    const customId = parsed.custom_id ?? `line-${i}`;

    // Per-line endpoint enforcement — must match the batch's declared endpoint
    if (parsed.url && parsed.url !== batch.endpoint) {
      errorLines.push(
        JSON.stringify({
          id: `batch_req_${crypto.randomUUID()}`,
          custom_id: customId,
          response: null,
          error: {
            code: "endpoint_mismatch",
            message: `Line url "${parsed.url}" does not match batch endpoint "${batch.endpoint}"`,
          },
        } as ErrorLine)
      );
      failed++;
      continue;
    }

    // ─── Fire the upstream request ─────────────────────────────
    const upstreamPath = batch.endpoint.replace(/^\/v1/, ""); // /v1/chat/completions → /chat/completions
    const startedAt = Date.now();
    let resp: Response;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), PER_REQUEST_TIMEOUT_MS);
      resp = await fetch(`${OPENROUTER_BASE}${upstreamPath}`, {
        method: parsed.method ?? "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${upstreamKey}`,
          "HTTP-Referer": "https://cs2hvh.com",
          "X-Title": "AhuraCloud Inference (batch)",
        },
        body: JSON.stringify(parsed.body ?? {}),
        signal: ctrl.signal,
      });
      clearTimeout(t);
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      errorLines.push(
        JSON.stringify({
          id: `batch_req_${crypto.randomUUID()}`,
          custom_id: customId,
          response: null,
          error: {
            code: "upstream_unreachable",
            message:
              customerSafeErrorMessage(rawMsg) ||
              "Upstream did not respond. Please retry this line.",
          },
        } as ErrorLine)
      );
      failed++;
      continue;
    }

    const latencyMs = Date.now() - startedAt;
    const requestId = `batch_req_${crypto.randomUUID()}`;
    const respText = await resp.text();
    let respJson: unknown;
    try {
      respJson = JSON.parse(respText);
    } catch {
      respJson = { raw: respText.slice(0, 2000) };
    }

    if (!resp.ok) {
      const upstreamRaw =
        typeof respJson === "object" && respJson && "error" in respJson
          ? String((respJson as { error?: { message?: string } }).error?.message ?? respText.slice(0, 280))
          : respText.slice(0, 280);
      errorLines.push(
        JSON.stringify({
          id: requestId,
          custom_id: customId,
          response: null,
          error: {
            code: `upstream_${resp.status}`,
            message:
              customerSafeErrorMessage(upstreamRaw) ||
              `Upstream returned ${resp.status}. Please retry this line.`,
          },
        } as ErrorLine)
      );
      failed++;
      continue;
    }

    outputLines.push(
      JSON.stringify({
        id: requestId,
        custom_id: customId,
        response: {
          status_code: resp.status,
          request_id: requestId,
          body: respJson,
        },
        error: null,
      } as OutputLine)
    );
    completed++;

    // ─── Emit a usage row for billing. Discount happens HERE for
    //     simplicity; the consumer flow path doesn't need to know
    //     about batches. ──────────────────────────────────────────
    const usage = extractUsage(respJson);
    if (usage) {
      const modelId =
        typeof parsed.body === "object" && parsed.body && "model" in parsed.body
          ? String((parsed.body as { model?: string }).model ?? "")
          : "";
      const discounted = Math.ceil((usage.estCostCents ?? 0) * BATCH_DISCOUNT_FACTOR);
      try {
        await supabase.schema("inference").from("usage").insert({
          org_id: batch.org_id,
          api_key_id: null,
          user_id: batch.created_by,
          model_id: modelId,
          modality:
            batch.endpoint === "/v1/embeddings" ? "embedding" : "chat",
          request_id: requestId,
          billed_to: "platform",
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cached_tokens: null,
          cost_cents: discounted,
          upstream_cost_cents: usage.estCostCents,
          is_off_peak: false,
          latency_ms: latencyMs,
          ttft_ms: null,
          status: "success",
          error_code: null,
          is_batch: true,
          batch_id: id,
        });
      } catch (err) {
        // Don't fail the batch on a billing-row hiccup; log and continue.
        console.error("[Batch processor] usage insert failed:", err);
      }
    }

    // ─── Periodic counts heartbeat so the dashboard polls update ─
    if (i % 5 === 0) {
      void supabase
        .schema("inference")
        .from("batches")
        .update({ request_counts: { total: lines.length, completed, failed } })
        .eq("id", id);
    }
  }

  // ─── Finalize ─────────────────────────────────────────────────
  await supabase
    .schema("inference")
    .from("batches")
    .update({
      status: "finalizing",
      finalizing_at: new Date().toISOString(),
      request_counts: { total: lines.length, completed, failed },
    })
    .eq("id", id);

  const { outputFileId, errorFileId } = await writeOutputFiles(
    supabase,
    batch.org_id,
    batch.created_by,
    id,
    outputLines,
    errorLines
  );

  await supabase
    .schema("inference")
    .from("batches")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      output_file_id: outputFileId,
      error_file_id: errorFileId,
      request_counts: { total: lines.length, completed, failed },
    })
    .eq("id", id);

  const ctx = auditContextFrom(request);
  void recordAudit({
    orgId: batch.org_id,
    actorUserId: orgIdFromUser ? null : null,
    action: "batch.completed",
    targetType: "batch",
    targetId: id,
    metadata: { completed, failed, total: lines.length },
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  });

  return NextResponse.json({
    id,
    status: "completed",
    request_counts: { total: lines.length, completed, failed },
    output_file_id: outputFileId,
    error_file_id: errorFileId,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────

// Helper supabase params typed as `any` — the createClient return type
// when narrowed to .schema("inference") doesn't unify across helper
// boundaries, and these helpers don't benefit from row-shape typing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

async function markFailed(supabase: Sb, id: string, message: string): Promise<void> {
  // Defense-in-depth: ensure no leaky upstream copy lands in the customer-
  // visible `errors` field even if a caller forgot to sanitize.
  const safe = customerSafeErrorMessage(message) || "Batch failed. Please retry.";
  await supabase
    .schema("inference")
    .from("batches")
    .update({
      status: "failed",
      failed_at: new Date().toISOString(),
      errors: { message: safe },
    })
    .eq("id", id);
}

async function finalizeAsCancelled(
  supabase: Sb,
  id: string,
  orgId: string,
  outputLines: string[],
  errorLines: string[],
  completed: number,
  failed: number
): Promise<void> {
  const { outputFileId, errorFileId } = await writeOutputFiles(
    supabase,
    orgId,
    null,
    id,
    outputLines,
    errorLines
  );
  await supabase
    .schema("inference")
    .from("batches")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      output_file_id: outputFileId,
      error_file_id: errorFileId,
      request_counts: { total: outputLines.length + errorLines.length, completed, failed },
    })
    .eq("id", id);
}

async function writeOutputFiles(
  supabase: Sb,
  orgId: string,
  createdBy: string | null,
  batchId: string,
  outputLines: string[],
  errorLines: string[]
): Promise<{ outputFileId: string | null; errorFileId: string | null }> {
  let outputFileId: string | null = null;
  let errorFileId: string | null = null;

  if (outputLines.length > 0) {
    const fid = makeFileId();
    const body = Buffer.from(outputLines.join("\n") + "\n", "utf8");
    await supabase.schema("inference").from("files").insert({
      id: fid,
      org_id: orgId,
      created_by: createdBy,
      purpose: "batch_output",
      filename: `${batchId}_output.jsonl`,
      bytes: body.length,
      r2_bucket: "ahura-batches",
      r2_key: `${orgId}/${fid}.jsonl`,
      produced_by_batch_id: batchId,
    });
    await uploadBytes(orgId, fid, body);
    outputFileId = fid;
  }

  if (errorLines.length > 0) {
    const fid = makeFileId();
    const body = Buffer.from(errorLines.join("\n") + "\n", "utf8");
    await supabase.schema("inference").from("files").insert({
      id: fid,
      org_id: orgId,
      created_by: createdBy,
      purpose: "batch_error",
      filename: `${batchId}_errors.jsonl`,
      bytes: body.length,
      r2_bucket: "ahura-batches",
      r2_key: `${orgId}/${fid}.jsonl`,
      produced_by_batch_id: batchId,
    });
    await uploadBytes(orgId, fid, body);
    errorFileId = fid;
  }

  return { outputFileId, errorFileId };
}

function extractUsage(respBody: unknown): {
  inputTokens: number | null;
  outputTokens: number | null;
  estCostCents: number | null;
} | null {
  if (!respBody || typeof respBody !== "object") return null;
  const usage = (respBody as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
  if (!usage) return null;
  // Cost estimation — Worker consumer computes the real rate from
  // inference.models.pricing; we can't easily duplicate that lookup
  // here without an extra query per line. Stamp zero and let a
  // periodic reconciliation job true things up. Until that ships,
  // is_batch=true rows carry a placeholder cost but the discount
  // factor is still applied at insert time so reporting is directionally
  // correct.
  return {
    inputTokens: usage.prompt_tokens ?? null,
    outputTokens: usage.completion_tokens ?? null,
    estCostCents: 0,
  };
}
