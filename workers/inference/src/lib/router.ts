/**
 * Smart routing — resolves the virtual model ids `ahura/auto` and
 * `ahura/auto-cheap` to a concrete catalog model, per request.
 *
 * Doc: nextstespsAI/07-inference-completeness.md (Slice 2, "smart routing").
 *
 * The design there assumed a `router_policies` table plus a KV-cached scored
 * model table refreshed by a cron. Neither is needed: `inference.models`
 * ALREADY carries everything the scorer wants —
 *   - `pricing.{input,output}_cents_per_mtok`  → real cost, kept current by
 *     the existing catalog sync
 *   - `capabilities.{tools,vision,json_mode,streaming,context_window}`
 *                                              → what the model can actually do
 *   - `is_featured` + `sort_order`             → the hand-curated quality rank
 *                                                (see curationRank — sort_order
 *                                                 ALONE is not a quality signal)
 * so this ships as a pure read over the existing catalog with an isolate-local
 * cache, exactly like presets.ts. No migration, no new cron, no new table.
 *
 * Two policies ship; both are deterministic, so the same request against the
 * same catalog always picks the same model (important: a customer's cost and
 * behaviour must not wobble request to request).
 *
 *   ahura/auto        balanced — cheapest model that is still highly ranked
 *   ahura/auto-cheap  cost-dominant — the cheapest model that CAN do the job
 *
 * `ahura/auto-fast` from the doc is deliberately NOT implemented: we have no
 * per-model latency telemetry yet, and picking "fast" by proxy (small model,
 * low price) would be a guess sold as a measurement. `inference.trace_spans`
 * already records per-request latency, so a real p50-driven `auto-fast` is a
 * follow-up with actual data behind it.
 */
import { createClient } from "@supabase/supabase-js";
import type { Env } from "../types.ts";

/** Weights are (cost, quality) and must sum to 1. */
const POLICIES: Record<string, { costWeight: number; qualityWeight: number }> = {
  "ahura/auto": { costWeight: 0.5, qualityWeight: 0.5 },
  "ahura/auto-cheap": { costWeight: 0.85, qualityWeight: 0.15 },
};

/**
 * A representative request is more prompt than completion, but completion
 * tokens are the expensive half, so neither price alone ranks models the way
 * a bill actually lands. 3:1 input:output is the blend used to collapse the
 * two prices into one comparable number.
 */
const INPUT_WEIGHT = 3;
const OUTPUT_WEIGHT = 1;

const CACHE_TTL_MS = 5 * 60_000;

export interface CandidateModel {
  model_id: string;
  pricing: { input_cents_per_mtok?: number; output_cents_per_mtok?: number } | null;
  capabilities: Record<string, unknown> | null;
  sort_order: number | null;
  is_featured: boolean | null;
}

/**
 * Curation rank — lower is better.
 *
 * `sort_order` alone is NOT a quality signal: it defaults to 0, and four
 * catalog rows (the older gpt-4o / gpt-4.1 family) still carry that default.
 * Ranking on it directly put an uncurated model ahead of claude-opus-4.7
 * (sort_order 10) purely because nobody had ordered it — verified against the
 * live catalog while building this. So `is_featured` — 17 hand-picked
 * flagships — is the primary signal, `sort_order` only breaks ties WITHIN a
 * tier, and an uncurated 0 sorts to the back of its tier rather than the front.
 */
export function curationRank(model: CandidateModel): [number, number] {
  const tier = model.is_featured === true ? 0 : 1;
  const order =
    model.sort_order === null || model.sort_order === 0
      ? Number.MAX_SAFE_INTEGER
      : model.sort_order;
  return [tier, order];
}

/** What the incoming request actually needs a model to support. */
export interface ModelRequirements {
  tools: boolean;
  vision: boolean;
  jsonMode: boolean;
  streaming: boolean;
  /** Rough prompt size in tokens; a model whose context can't hold it is out. */
  minContextWindow: number;
}

export function isAutoModel(modelId: string): boolean {
  return modelId in POLICIES;
}

/**
 * Catalog entries for the virtual router ids, so `GET /v1/models` advertises
 * them. They are not rows in inference.models — nothing to route TO if they
 * were — but a feature a customer cannot discover may as well not exist.
 *
 * `pricing` is deliberately null: the price is whatever the resolved model
 * costs, and quoting a single number here would be wrong for every request.
 * Capabilities are the UNION the router can satisfy — it only ever picks a
 * model that meets the request's actual requirements.
 */
export function virtualRouterModels(): Array<{
  id: string;
  display_name: string;
  description: string;
}> {
  return [
    {
      id: "ahura/auto",
      display_name: "Auto (balanced)",
      description:
        "Picks a model per request: the most cost-effective curated model that meets the " +
        "request's requirements (tools, vision, JSON mode, context length). The resolved " +
        "model is returned in the X-Ahura-Model response header and is what you are billed for.",
    },
    {
      id: "ahura/auto-cheap",
      display_name: "Auto (cheapest)",
      description:
        "Picks the cheapest model that can satisfy the request. Same capability guarantees " +
        "as ahura/auto, weighted almost entirely toward cost.",
    },
  ];
}

/**
 * Derive hard requirements from the request body. Anything we can't detect
 * confidently is left false — over-constraining would shrink the candidate
 * pool and push traffic to expensive models for no reason.
 */
export function requirementsFromRequest(body: {
  messages?: unknown;
  tools?: unknown;
  functions?: unknown;
  response_format?: unknown;
  stream?: unknown;
}): ModelRequirements {
  const tools =
    (Array.isArray(body.tools) && body.tools.length > 0) ||
    (Array.isArray(body.functions) && body.functions.length > 0);

  const rf = body.response_format as { type?: string } | undefined;
  const jsonMode = rf?.type === "json_object" || rf?.type === "json_schema";

  const messages = Array.isArray(body.messages) ? body.messages : [];
  let vision = false;
  let chars = 0;
  for (const m of messages) {
    const content = (m as { content?: unknown } | null)?.content;
    if (typeof content === "string") {
      chars += content.length;
    } else if (Array.isArray(content)) {
      for (const part of content) {
        const p = part as { type?: string; text?: string } | null;
        if (p?.type === "image_url" || p?.type === "input_image") vision = true;
        if (typeof p?.text === "string") chars += p.text.length;
      }
    }
  }

  return {
    tools,
    vision,
    jsonMode,
    streaming: body.stream === true,
    // ~4 chars/token, then a 25% headroom for the completion and the
    // chat scaffolding we don't see here.
    minContextWindow: Math.ceil((chars / 4) * 1.25),
  };
}

function capBool(caps: Record<string, unknown> | null, key: string): boolean {
  return caps?.[key] === true;
}

/** True when the model can satisfy every hard requirement. */
export function satisfies(model: CandidateModel, req: ModelRequirements): boolean {
  const caps = model.capabilities;
  if (req.tools && !capBool(caps, "tools")) return false;
  if (req.vision && !capBool(caps, "vision")) return false;
  if (req.jsonMode && !capBool(caps, "json_mode")) return false;
  if (req.streaming && !capBool(caps, "streaming")) return false;
  if (req.minContextWindow > 0) {
    const ctx = caps?.["context_window"];
    if (typeof ctx === "number" && ctx < req.minContextWindow) return false;
  }
  return true;
}

/** Blended price, in cents per Mtok. Missing pricing sorts last, not first —
 *  an unpriced model must never win a cost-weighted race by default. */
export function blendedCost(model: CandidateModel): number {
  const inp = model.pricing?.input_cents_per_mtok;
  const out = model.pricing?.output_cents_per_mtok;
  if (typeof inp !== "number" || typeof out !== "number") return Number.POSITIVE_INFINITY;
  return (inp * INPUT_WEIGHT + out * OUTPUT_WEIGHT) / (INPUT_WEIGHT + OUTPUT_WEIGHT);
}

/**
 * Rank-normalise then blend — the same reason hybrid_search fuses by RANK
 * rather than raw score: cost (cents) and sort_order (an ordinal) live on
 * incomparable scales, and one outlier model priced 50x the field would
 * otherwise flatten every other difference. Lower score wins.
 */
export function scoreCandidates(
  candidates: CandidateModel[],
  policy: { costWeight: number; qualityWeight: number }
): Array<{ model: CandidateModel; score: number }> {
  if (candidates.length === 0) return [];

  const byCost = [...candidates].sort(
    (a, b) => blendedCost(a) - blendedCost(b) || a.model_id.localeCompare(b.model_id)
  );
  const byQuality = [...candidates].sort((a, b) => {
    const [aTier, aOrder] = curationRank(a);
    const [bTier, bOrder] = curationRank(b);
    return aTier - bTier || aOrder - bOrder || a.model_id.localeCompare(b.model_id);
  });

  const costRank = new Map(byCost.map((m, i) => [m.model_id, i]));
  const qualityRank = new Map(byQuality.map((m, i) => [m.model_id, i]));
  const denom = Math.max(candidates.length - 1, 1);

  return candidates
    .map((model) => ({
      model,
      score:
        policy.costWeight * ((costRank.get(model.model_id) ?? 0) / denom) +
        policy.qualityWeight * ((qualityRank.get(model.model_id) ?? 0) / denom),
    }))
    // Deterministic: ties break on model_id so the same catalog always yields
    // the same pick.
    .sort((a, b) => a.score - b.score || a.model.model_id.localeCompare(b.model.model_id));
}

// ── Catalog fetch (isolate-cached, same shape as presets.ts) ────────────────
let catalogCache: { models: CandidateModel[]; expiresAt: number } | null = null;

async function loadChatCatalog(env: Env): Promise<CandidateModel[]> {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.models;

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ahura-inference-edge-router" } },
  });

  const { data, error } = await supabase
    .schema("inference")
    .from("models")
    .select("model_id, pricing, capabilities, sort_order, is_featured")
    .eq("is_active", true)
    .eq("modality", "chat")
    // Shared catalog only. A runpod_ft / runpod_byo model is one org's private
    // adapter or self-hosted deployment — auto-routing a different org onto it
    // would be a cross-tenant leak, and routing its OWNER onto it silently is
    // still wrong (they asked for "pick a good model", not "use my finetune").
    .eq("serving_type", "proxy")
    .returns<CandidateModel[]>();

  if (error || !data) return catalogCache?.models ?? [];

  catalogCache = { models: data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}

/** Test seam — lets the unit tests exercise selection without a network. */
export function __setCatalogCacheForTests(models: CandidateModel[] | null): void {
  catalogCache = models ? { models, expiresAt: Date.now() + CACHE_TTL_MS } : null;
}

export interface RouterResult {
  /** Concrete catalog model id to use for the rest of the request. */
  model: string;
  policy: string;
  /** How many models were eligible — surfaced as a header for debuggability. */
  consideredCount: number;
}

/**
 * Resolve an `ahura/auto*` id to a concrete model.
 *
 * `allowedModels` is the API key's scope: when a key is restricted, the router
 * must choose from within that scope, otherwise auto-routing would pick a model
 * the very next check rejects with a confusing 403.
 *
 * Returns null when nothing in the catalog can satisfy the request — the caller
 * turns that into a 400 that names the requirement, rather than silently
 * downgrading to a model that can't do the job.
 */
export async function resolveAutoModel(
  env: Env,
  autoId: string,
  requirements: ModelRequirements,
  allowedModels?: string[] | null
): Promise<RouterResult | null> {
  const policy = POLICIES[autoId];
  if (!policy) return null;

  const catalog = await loadChatCatalog(env);
  let eligible = catalog.filter((m) => satisfies(m, requirements));
  if (allowedModels && allowedModels.length > 0) {
    eligible = eligible.filter((m) => allowedModels.includes(m.model_id));
  }
  if (eligible.length === 0) return null;

  const winner = scoreCandidates(eligible, policy)[0];
  if (!winner) return null;
  return { model: winner.model.model_id, policy: autoId, consideredCount: eligible.length };
}
