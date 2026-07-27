/**
 * Embedding client — calls the inference gateway's /v1/embeddings with the
 * collection's model, in batches (array input), attributed to the customer org
 * via X-Ahura-On-Behalf-Of-Org so every embed is METERED to that org (the same
 * on-behalf-of path agent-runner uses). This is the one place connector cost
 * enters billing — no new metering, it rides the existing usage pipeline.
 *
 * EmbedError carries the HTTP status so the lifecycle can stop a sync cleanly
 * on a mid-sync 402 (org hit its spend cap) rather than hammering (§ analysis).
 *
 * Doc: nextstespsAI/20-rag-connectors-and-data-runner.md (§10, Slice C2).
 */
import type { RunnerEnv } from "./env.js";

export class EmbedError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "EmbedError";
  }
  /** A spend-cap / balance rejection — the whole sync should stop, not retry. */
  get isSpendBlocked(): boolean {
    return this.status === 402;
  }
}

interface EmbeddingsResponse {
  data?: Array<{ embedding: number[]; index: number }>;
}

/** Embed `texts` in EMBED_BATCH-sized batches, returning one vector per text
 *  in input order. Throws EmbedError (with status) on any batch failure. */
export async function embedTexts(
  env: RunnerEnv,
  model: string,
  texts: string[],
  orgId: string
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += env.embedBatch) {
    const batch = texts.slice(i, i + env.embedBatch);
    out.push(...(await embedOneBatch(env, model, batch, orgId)));
  }
  return out;
}

async function embedOneBatch(
  env: RunnerEnv,
  model: string,
  batch: string[],
  orgId: string
): Promise<number[][]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.requestTimeoutMs);
  try {
    const res = await fetch(`${env.inferenceBaseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.inferencePlatformKey}`,
        "Content-Type": "application/json",
        "X-Ahura-On-Behalf-Of-Org": orgId,
      },
      body: JSON.stringify({ model, input: batch }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new EmbedError(res.status, `embeddings HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = (await res.json()) as EmbeddingsResponse;
    const rows = (data.data ?? []).slice().sort((a, b) => a.index - b.index);
    if (rows.length !== batch.length) {
      throw new EmbedError(502, `embeddings returned ${rows.length} vectors for ${batch.length} inputs`);
    }
    return rows.map((r) => r.embedding);
  } catch (err) {
    if (err instanceof EmbedError) throw err;
    // Network/abort/timeout — treat as a transient 503-class failure.
    throw new EmbedError(503, err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}
