/**
 * Server-side embedding helper for the vector store auto-embed path.
 *
 * Used by /api/inference/vector/collections/[id]/upsert and /query when the
 * caller passes raw text instead of a pre-computed embedding. Forwards to
 * OpenRouter using the platform key (env OPENROUTER_PLATFORM_KEY) — same
 * upstream as the gateway's /v1/embeddings route.
 *
 * If OPENROUTER_PLATFORM_KEY isn't set, auto-embed is unavailable and
 * callers must pass pre-computed embeddings. We surface this with a clear
 * error so the caller knows what to do.
 */

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

export interface EmbedResult {
  embedding: number[];
  inputTokens: number | null;
}

export async function embedText(
  text: string,
  modelId: string,
  dimensions?: number
): Promise<EmbedResult> {
  const key = process.env.OPENROUTER_PLATFORM_KEY;
  if (!key) {
    throw new Error(
      "Auto-embed not configured: set OPENROUTER_PLATFORM_KEY in the Next.js env, or pass a pre-computed `embedding` array instead of `text`."
    );
  }

  const body: Record<string, unknown> = {
    model: modelId,
    input: text,
  };
  if (dimensions) body.dimensions = dimensions;

  const r = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ahurasense.com",
      "X-Title": "AhuraCloud Inference (vector autoembed)",
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
