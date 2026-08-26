/**
 * OpenRouter — the default supplier, and the fallback for every other one.
 *
 * This is the behaviour the gateway has always had, moved behind the Supplier
 * interface unchanged. Nothing here is new.
 */
import type { Env } from "../../types.ts";
import type { Supplier, UpstreamPath } from "./types.ts";

/** Every path we forward. OpenRouter serves all of them. */
const SUPPORTED: ReadonlySet<UpstreamPath> = new Set<UpstreamPath>([
  "/chat/completions",
  "/completions",
  "/messages",
  "/embeddings",
  "/rerank",
  "/images",
  "/videos",
]);

export const openrouter: Supplier = {
  id: "openrouter",

  baseUrl: (env: Env) => env.OPENROUTER_BASE_URL.replace(/\/+$/, ""),

  platformKey: (env: Env) => env.OPENROUTER_PLATFORM_KEY || undefined,

  // Attribution headers OpenRouter uses for its own dashboards. Harmless
  // elsewhere, but they name us to the upstream, so they are supplier-specific
  // rather than something forwardJson sends to everyone.
  headers: () => ({
    "HTTP-Referer": "https://ahurasense.com",
    "X-Title": "AhuraCloud Inference",
  }),

  supports: (path: UpstreamPath) => SUPPORTED.has(path),

  // OpenRouter's paths ARE the canonical ones — the canonical set was taken
  // from it, since it is what the gateway has always spoken.
  path: (path: UpstreamPath) => path,
};
