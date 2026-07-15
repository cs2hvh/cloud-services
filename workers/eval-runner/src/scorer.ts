/**
 * Eval scorers.
 *
 * Each scorer receives the model's output and the expected string (may be null)
 * and returns a score in [0, 1] with an optional reasoning string.
 *
 * llm_judge calls our own inference gateway. Found live (2026-07-15): this
 * call authenticated with the static INFERENCE_PLATFORM_KEY but never sent
 * X-Ahura-On-Behalf-Of-Org, so — exactly the misattribution bug agent-runner
 * had and fixed on 2026-07-06 (see gateway.ts's header comment there) — every
 * judge call billed the platform's own org, never the customer running the
 * eval. Now carries the header; usage tokens are returned so the caller
 * (lifecycle.ts) can price the judge call the same way it prices the target
 * model call.
 */

export interface ScoreResult {
  score: number;       // 0.0 (fail) to 1.0 (pass); llm_judge may return fractional
  reasoning: string | null;
  usage?: { inputTokens: number; outputTokens: number }; // llm_judge only
}

// ── Deterministic scorers ──────────────────────────────────────────────────────

export function scoreExact(output: string, expected: string | null): ScoreResult {
  if (expected == null) return { score: 0, reasoning: "No expected value set" };
  const pass = output.trim() === expected.trim();
  return { score: pass ? 1 : 0, reasoning: pass ? "Exact match" : "Output did not match expected" };
}

export function scoreContains(output: string, expected: string | null): ScoreResult {
  if (expected == null) return { score: 0, reasoning: "No expected value set" };
  const pass = output.includes(expected.trim());
  return { score: pass ? 1 : 0, reasoning: pass ? "Contains expected substring" : "Output did not contain expected substring" };
}

export function scoreRegex(output: string, pattern: string | null | undefined): ScoreResult {
  if (!pattern) return { score: 0, reasoning: "No pattern configured" };
  try {
    const pass = new RegExp(pattern).test(output);
    return { score: pass ? 1 : 0, reasoning: pass ? `Matched /${pattern}/` : `Did not match /${pattern}/` };
  } catch (err) {
    return { score: 0, reasoning: `Invalid regex: ${String(err)}` };
  }
}

export function scoreJsonSchema(
  output: string,
  schema: Record<string, unknown> | null | undefined
): ScoreResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output.trim());
  } catch {
    return { score: 0, reasoning: "Output is not valid JSON" };
  }

  if (!schema) {
    return { score: 1, reasoning: "Valid JSON" };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { score: 0, reasoning: "Output must be a JSON object" };
  }

  const obj = parsed as Record<string, unknown>;
  const failures: string[] = [];

  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  for (const key of required) {
    if (!(key in obj)) failures.push(`missing required key "${key}"`);
  }

  const props =
    schema.properties && typeof schema.properties === "object"
      ? (schema.properties as Record<string, { type?: string }>)
      : {};

  for (const [key, def] of Object.entries(props)) {
    if (key in obj && def.type) {
      const actual = Array.isArray(obj[key]) ? "array" : obj[key] === null ? "null" : typeof obj[key];
      if (actual !== def.type) failures.push(`"${key}" must be ${def.type}, got ${actual}`);
    }
  }

  if (failures.length > 0) {
    return { score: 0, reasoning: `Schema validation failed: ${failures.join("; ")}` };
  }
  return { score: 1, reasoning: "Valid JSON matching schema" };
}

// ── LLM judge ─────────────────────────────────────────────────────────────────

const DEFAULT_JUDGE_PROMPT = `You are an impartial AI evaluator. Score the model's response on a scale of 0 to 1.
1.0 = fully correct and complete
0.5 = partially correct or incomplete
0.0 = incorrect or off-topic

Respond with ONLY a JSON object: {"score": <0-1>, "reasoning": "<one sentence>"}
Do not include any other text.`;

export async function scoreLlmJudge(
  output: string,
  expected: string | null,
  input: Array<{ role: string; content: string }>,
  judgeModel: string,
  judgePromptOverride: string | null | undefined,
  inferenceBaseUrl: string,
  platformKey: string,
  timeoutMs: number,
  orgId: string
): Promise<ScoreResult> {
  const systemPrompt = judgePromptOverride ?? DEFAULT_JUDGE_PROMPT;

  const userMsg = [
    expected ? `EXPECTED ANSWER:\n${expected}\n` : "",
    `ACTUAL RESPONSE:\n${output}`,
    `\nUSER PROMPT (last turn):\n${input[input.length - 1]?.content ?? ""}`,
  ].filter(Boolean).join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${inferenceBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${platformKey}`,
        "Content-Type": "application/json",
        "X-Ahura-On-Behalf-Of-Org": orgId,
      },
      body: JSON.stringify({
        model: judgeModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMsg },
        ],
        max_tokens: 200,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { score: 0, reasoning: `Judge call failed (HTTP ${res.status}): ${txt.slice(0, 200)}` };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const raw = data.choices?.[0]?.message?.content ?? "";
    const usage = {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    };

    // Extract JSON from the judge's response
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { score: 0, reasoning: `Judge returned unparseable output: ${raw.slice(0, 200)}`, usage };

    const parsed = JSON.parse(match[0]) as { score?: unknown; reasoning?: unknown };
    const score = Math.min(1, Math.max(0, Number(parsed.score ?? 0)));
    const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : null;
    return { score, reasoning, usage };
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      return { score: 0, reasoning: "Judge call timed out" };
    }
    return { score: 0, reasoning: `Judge error: ${String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}
