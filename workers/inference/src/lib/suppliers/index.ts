/**
 * Supplier registry.
 *
 * `openrouter` is the floor: it serves every path, and it is what any other
 * supplier falls back to. A model with no explicit supplier is bought here,
 * which is why resolution never returns undefined for it.
 */
import type { Supplier, SupplierId } from "./types.ts";
import { openrouter } from "./openrouter.ts";
import { wokey } from "./wokey.ts";

const REGISTRY: Record<SupplierId, Supplier> = {
  openrouter,
  wokey,
};

/** The supplier every request falls back to, and the default for any model
 *  with no preference recorded. */
export const DEFAULT_SUPPLIER: Supplier = openrouter;

/**
 * Resolve a supplier id to its implementation.
 *
 * An unknown id resolves to the default rather than throwing: a bad value in
 * `models.preferred_provider` should send traffic to the safe supplier, not
 * fail the customer's request. Same rule as the fail-closed policy checks in
 * the plan (§9.4) — uncertainty routes to OpenRouter.
 */
export function getSupplier(id: string | null | undefined): Supplier {
  if (!id) return DEFAULT_SUPPLIER;
  return REGISTRY[id as SupplierId] ?? DEFAULT_SUPPLIER;
}

export type { Supplier, SupplierId, UpstreamPath } from "./types.ts";
export { openrouter, wokey };
