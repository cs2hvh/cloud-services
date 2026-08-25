/**
 * Server-side chat-completion helper for the dashboard's /answer
 * (grounded-generation) route. Mirrors embeddings.ts's pattern exactly:
 * forwards to OpenRouter using the platform key, same upstream the gateway
 * uses. Like the rest of this dashboard "try it out" surface (embedText,
 * the existing Test Query panel), this is NOT billed — dashboard testing
 * traffic has never gone through the usage-event pipeline here; production
 * traffic goes through the API-key gateway (workers/inference), where every
 * call IS billed. Not an oversight, matches the established pattern for
 * every other dashboard-originated inference call in this file family.
 */
import { createClient } from "@supabase/supabase-js";

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
}

export async function resolveChatUpstreamModelId(modelId: string): Promise<string | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data } = await supabase
    .schema("inference")
    .from("models")
    .select("upstream_model_id, is_active")
    .eq("model_id", modelId)
    .maybeSingle<{ upstream_model_id: string | null; is_active: boolean }>();
  if (!data || !data.is_active || !data.upstream_model_id) return null;
  return data.upstream_model_id;
}

export async function callChatCompletion(
  upstreamModelId: string,
  messages: ChatMessage[]
): Promise<ChatResult> {
  const key = process.env.OPENROUTER_PLATFORM_KEY;
  if (!key) {
    throw new Error("Generation not configured: set OPENROUTER_PLATFORM_KEY in the Next.js env.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ahurasense.com",
        "X-Title": "AhuraCloud Inference (dashboard answer)",
      },
      body: JSON.stringify({ model: upstreamModelId, messages }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Upstream generation failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    content: data.choices?.[0]?.message?.content ?? "",
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
  };
}
