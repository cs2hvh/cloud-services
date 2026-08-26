/**
 * Server-side embedding helper for the vector store auto-embed path.
 *
 * Used by /api/inference/vector/collections/[id]/upsert and /query when the
 * caller passes raw text instead of a pre-computed embedding.
 *
 * AUTO-EMBED IS CURRENTLY UNAVAILABLE. The platform upstream moved from
 * OpenRouter to Wokey, and Wokey serves no embeddings endpoint and no
 * embedding model. Rather than call an endpoint that does not exist, this
 * throws a directive error: existing vector collections keep working and
 * remain queryable, because callers can still pass a pre-computed
 * `embedding` array — only the convenience path of "send text, we'll embed
 * it" is gone.
 *
 * To restore: set EMBEDDINGS_BASE_URL (and EMBEDDINGS_API_KEY if that
 * provider differs from the main upstream) and the code below resumes. The
 * same two variables re-enable the gateway's semantic cache — see
 * workers/inference/src/lib/semantic-cache.ts.
 */

const EMBEDDINGS_BASE = process.env.EMBEDDINGS_BASE_URL;

export interface EmbedResult {
  embedding: number[];
  inputTokens: number | null;
}

export async function embedText(
  text: string,
  modelId: string,
  dimensions?: number
): Promise<EmbedResult> {
  if (!EMBEDDINGS_BASE) {
    throw new Error(
      "Auto-embed is unavailable: this platform's inference upstream does not " +
        "serve embedding models. Pass a pre-computed `embedding` array instead " +
        "of `text`, or ask an operator to configure EMBEDDINGS_BASE_URL."
    );
  }
  const key = process.env.EMBEDDINGS_API_KEY ?? process.env.WOKEY_PLATFORM_KEY;
  if (!key) {
    throw new Error(
      "Auto-embed not configured: set EMBEDDINGS_API_KEY, or pass a " +
        "pre-computed `embedding` array instead of `text`."
    );
  }

  const body: Record<string, unknown> = {
    model: modelId,
    input: text,
  };
  if (dimensions) body.dimensions = dimensions;

  const r = await fetch(`${EMBEDDINGS_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`Upstream embed failed (${r.status}): ${errText}`);
  }

  const data = (await r.json()) as {
    data?: Array<{ embedding?: number[] }>;
    usage?: { prompt_tokens?: number };
  };
  const embedding = data.data?.[0]?.embedding;
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error("Upstream returned no embedding");
  }
  return { embedding, inputTokens: data.usage?.prompt_tokens ?? null };
}
