/**
 * The supplier seam.
 *
 * Everything that differs between one place we buy model capacity and another
 * lives behind this interface, and nothing else in the gateway knows a supplier
 * name. The test for whether that stayed true: adding supplier #3 should mean
 * one new file here plus a registration — never a change to request-execution
 * logic, the cost pipeline, or an individual route.
 *
 * Doc: docs/inference/supply-routing-plan.md §9.3.
 */
import type { Env } from "../../types.ts";

/** Suppliers we can buy capacity from. Matches inference.byok_provider so the
 *  catalog, the routes table and this code cannot drift apart. */
export type SupplierId = "openrouter" | "wokey";

/** The upstream paths the gateway forwards to. Not every supplier serves all
 *  of them — Wokey has no /embeddings or /rerank at all, so asking is part of
 *  the interface rather than something a route discovers via a 404. */
export type UpstreamPath =
  | "/chat/completions"
  | "/completions"
  | "/messages"
  | "/embeddings"
  | "/rerank"
  | "/images"
  | "/videos";

export interface Supplier {
  readonly id: SupplierId;

  /** Base URL, no trailing slash. */
  baseUrl(env: Env): string;

  /** The platform-billed API key, or undefined when not configured. Undefined
   *  is a normal state for a supplier nobody has enabled yet — callers turn it
   *  into "route elsewhere", not into a crash. */
  platformKey(env: Env): string | undefined;

  /** Headers this supplier wants beyond Authorization and Content-Type. */
  headers(): Record<string, string>;

  /** Does this supplier serve this path at all? Verified by probing the live
   *  API, not assumed — see the plan §6.1. */
  supports(path: UpstreamPath): boolean;

  /** The supplier's own path for a canonical one. Suppliers disagree on more
   *  than the host: OpenRouter serves image generation at `/images`, Wokey at
   *  `/images/generations`. Callers pass the canonical path and never learn
   *  the difference. */
  path(path: UpstreamPath): string;
}
