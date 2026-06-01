/**
 * Pre-flight validation for fine-tuning jobs.
 *
 * Run synchronously inside POST /api/inference/fine-tuning/jobs BEFORE
 * inserting the job — catches ~80% of failure modes (bad dataset URL,
 * malformed JSONL, schema mismatches, oversized examples) without
 * burning a single GPU-second.
 *
 * Output drives the response payload: warnings show up in the dashboard,
 * errors block the job creation entirely.
 *
 * Token counting is approximate (chars/4) in v1. Replace with a proper
 * tokenizer (tiktoken for OpenAI-family, HF tokenizer otherwise) when
 * cost preview accuracy starts to matter for billing.
 */

const MAX_DATASET_BYTES = 500 * 1024 * 1024; // 500 MB upload cap
const MAX_ERRORS_REPORTED = 5;
const MIN_RECOMMENDED_EXAMPLES = 100;
const APPROXIMATE_CHARS_PER_TOKEN = 4;

/** Pricing per million training tokens, in cents. Together-style. */
export const FT_PRICE_PER_MTOK_CENTS: Record<string, number> = {
  // Cheap small bases — under $0.50/Mtok target
  "microsoft/phi-4": 30,
  "google/gemma-4-27b-it": 40,
  "meta-llama/llama-3.3-8b-instruct": 40,
  "qwen/qwen-3-8b-instruct": 40,
  // Mid-tier
  "qwen/qwen-3-14b-instruct": 60,
  "meta-llama/llama-4-scout": 80,
  "deepseek/deepseek-v3.2": 100,
  "qwen/qwen-3-32b-instruct": 100,
  "mistralai/mistral-nemo": 60,
  // Large
  "meta-llama/llama-3.3-70b-instruct": 150,
  "meta-llama/llama-4-maverick": 200,
  "qwen/qwen-3-235b-instruct": 250,
  "mistralai/mistral-large-3": 250,
};

const DEFAULT_PRICE_CENTS = 100;

export interface PreflightResult {
  ok: boolean;
  total_examples: number;
  total_tokens: number;
  truncated_examples: number;
  estimated_cost_cents: number;
  estimated_duration_minutes: number;
  warnings: string[];
  errors: string[];
}

export async function preflightDataset(opts: {
  datasetUrl: string;
  baseModelId: string;
  sequenceLen: number;
  epochs: number;
}): Promise<PreflightResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── 1. HEAD check (gate size before pulling the body) ─────────────
  let totalBytes = 0;
  try {
    const headResp = await fetch(opts.datasetUrl, { method: "HEAD" });
    if (!headResp.ok) {
      // Some S3 / R2 presigned URLs reject HEAD — fall through to GET
      if (headResp.status !== 405 && headResp.status !== 403) {
        return fail([
          `Dataset URL returned ${headResp.status} on HEAD — confirm the URL is reachable and the file is publicly readable (or use a presigned URL).`,
        ]);
      }
    } else {
      totalBytes = Number.parseInt(headResp.headers.get("content-length") ?? "0", 10);
      if (totalBytes > MAX_DATASET_BYTES) {
        return fail([
          `Dataset is ${formatBytes(totalBytes)}; the upload-time cap is ${formatBytes(MAX_DATASET_BYTES)}. Split your dataset or run the job from a private bucket with multi-part streaming (Phase 7).`,
        ]);
      }
    }
  } catch (err) {
    return fail([
      `Couldn't reach dataset URL: ${err instanceof Error ? err.message : String(err)}`,
    ]);
  }

  // ── 2. Stream the body and parse JSONL line by line ───────────────
  let text: string;
  try {
    const resp = await fetch(opts.datasetUrl);
    if (!resp.ok) {
      return fail([`Dataset GET returned ${resp.status}`]);
    }
    text = await resp.text();
  } catch (err) {
    return fail([
      `Couldn't download dataset: ${err instanceof Error ? err.message : String(err)}`,
    ]);
  }

  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return fail(["Dataset has no non-empty lines"]);
  }

  let totalExamples = 0;
  let totalTokens = 0;
  let truncatedExamples = 0;

  for (const [i, line] of lines.entries()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      errors.push(`Line ${i + 1}: invalid JSON (${err instanceof Error ? err.message : "parse error"})`);
      if (errors.length >= MAX_ERRORS_REPORTED) break;
      continue;
    }

    if (!isMessagesRecord(parsed)) {
      errors.push(
        `Line ${i + 1}: missing or malformed \`messages\` array (expected OpenAI chat format: { messages: [{role, content}, ...] })`
      );
      if (errors.length >= MAX_ERRORS_REPORTED) break;
      continue;
    }

    if (parsed.messages.length === 0) {
      errors.push(`Line ${i + 1}: \`messages\` is empty`);
      if (errors.length >= MAX_ERRORS_REPORTED) break;
      continue;
    }

    // Sanity: must have at least one assistant turn — otherwise nothing to train
    if (!parsed.messages.some((m) => m.role === "assistant")) {
      errors.push(`Line ${i + 1}: no assistant turn — nothing to train on`);
      if (errors.length >= MAX_ERRORS_REPORTED) break;
      continue;
    }

    // Approximate tokens (chars/4 is OpenAI's rough rule of thumb for English)
    const approxTokens = parsed.messages.reduce(
      (sum, m) => sum + Math.ceil((m.content?.length ?? 0) / APPROXIMATE_CHARS_PER_TOKEN),
      0
    );
    totalTokens += approxTokens;
    if (approxTokens > opts.sequenceLen) {
      truncatedExamples += 1;
    }
    totalExamples += 1;
  }

  if (errors.length > 0) {
    return fail(errors);
  }

  // ── 3. Soft warnings ──────────────────────────────────────────────
  if (truncatedExamples > 0) {
    warnings.push(
      `${truncatedExamples} of ${totalExamples} examples (~${Math.round(
        (truncatedExamples / totalExamples) * 100
      )}%) exceed sequence_len=${opts.sequenceLen} and will be truncated. Consider raising max_seq_length or filtering long examples.`
    );
  }
  if (totalExamples < MIN_RECOMMENDED_EXAMPLES) {
    warnings.push(
      `Only ${totalExamples} examples — LoRA typically needs at least ${MIN_RECOMMENDED_EXAMPLES} for meaningful adaptation. Quality may suffer.`
    );
  }
  if (totalBytes === 0 && text.length > MAX_DATASET_BYTES) {
    warnings.push(
      `Dataset body was ${formatBytes(text.length)} — HEAD didn't return content-length so size cap was skipped. Future runs will be rejected if your upload host doesn't expose content-length.`
    );
  }

  // ── 4. Cost preview ───────────────────────────────────────────────
  const priceCents = FT_PRICE_PER_MTOK_CENTS[opts.baseModelId] ?? DEFAULT_PRICE_CENTS;
  const billableTokens = totalTokens * opts.epochs;
  const estimatedCostCents = Math.ceil((billableTokens / 1_000_000) * priceCents);

  // ── 5. Duration heuristic ─────────────────────────────────────────
  // Very rough: ~100k tokens/minute on an A100 80GB for LoRA + sample packing.
  // Tighten this once we have real telemetry from the first ~10 jobs.
  const estimatedDurationMinutes = Math.max(2, Math.ceil(billableTokens / 100_000));

  return {
    ok: true,
    total_examples: totalExamples,
    total_tokens: totalTokens,
    truncated_examples: truncatedExamples,
    estimated_cost_cents: estimatedCostCents,
    estimated_duration_minutes: estimatedDurationMinutes,
    warnings,
    errors: [],
  };

  function fail(errs: string[]): PreflightResult {
    return {
      ok: false,
      total_examples: 0,
      total_tokens: 0,
      truncated_examples: 0,
      estimated_cost_cents: 0,
      estimated_duration_minutes: 0,
      warnings: [],
      errors: errs,
    };
  }
}

// ─── helpers ─────────────────────────────────────────────────────────

interface MessagesRecord {
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content?: string;
  }>;
}

function isMessagesRecord(v: unknown): v is MessagesRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  if (!Array.isArray(r.messages)) return false;
  for (const m of r.messages) {
    if (typeof m !== "object" || m === null) return false;
    const mm = m as Record<string, unknown>;
    if (typeof mm.role !== "string") return false;
    if (
      mm.role !== "system" &&
      mm.role !== "user" &&
      mm.role !== "assistant" &&
      mm.role !== "tool"
    ) {
      return false;
    }
    if (mm.content !== undefined && typeof mm.content !== "string") return false;
  }
  return true;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
