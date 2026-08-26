/**
 * Wokey — a marketplace supplier.
 *
 * Capacity here comes from a two-sided marketplace: people run a Provider Node
 * exposing idle AI-subscription quota, and Wokey resells it. That is where the
 * 78-90% discount comes from, and where the risk comes from. It is never a
 * default and never a sole upstream — every route through it falls back to
 * OpenRouter. See docs/inference/supply-routing-plan.md.
 *
 * WHAT IT SERVES was established by probing the live API unauthenticated on
 * 2026-08-25 (401 = the endpoint exists and wants a key; 404 = it does not
 * exist), not from documentation:
 *
 *     /chat/completions     401  exists
 *     /messages             400  exists — validates an Anthropic body natively
 *     /responses            401  exists
 *     /images/generations   401  exists
 *     /videos               401  exists
 *     /embeddings           404  DOES NOT EXIST
 *     /rerank               404  DOES NOT EXIST
 *     /audio/speech         404  DOES NOT EXIST
 *     /audio/transcriptions 404  DOES NOT EXIST
 *     /moderations          404  DOES NOT EXIST
 *     /batches              404  DOES NOT EXIST
 *
 * So embeddings, rerank, TTS, STT, OCR, moderation and batch can never route
 * here. That is not a policy choice to revisit later — the endpoints are absent.
 */
import type { Env } from "../../types.ts";
import type { Supplier, UpstreamPath } from "./types.ts";

/** Probed, not assumed. See the header. */
const SUPPORTED: ReadonlySet<UpstreamPath> = new Set<UpstreamPath>([
  "/chat/completions",
  "/messages",
  "/images",
  "/videos",
]);

/** Where Wokey's paths differ from the canonical set. */
const PATH_OVERRIDES: Partial<Record<UpstreamPath, string>> = {
  "/images": "/images/generations",
};

export const wokey: Supplier = {
  id: "wokey",

  baseUrl: (env: Env) => (env.WOKEY_BASE_URL ?? "https://api.wokey.ai/v1").replace(/\/+$/, ""),

  platformKey: (env: Env) => env.WOKEY_PLATFORM_KEY || undefined,

  // No attribution headers: they would name us to a marketplace whose supply
  // chain we do not control, and Wokey asks for none.
  headers: () => ({}),

  supports: (path: UpstreamPath) => SUPPORTED.has(path),

  path: (path: UpstreamPath) => PATH_OVERRIDES[path] ?? path,
};
