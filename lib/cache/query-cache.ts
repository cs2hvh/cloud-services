/**
 * Query caching utilities for optimizing repeated database queries
 * Uses React's cache() for request-level memoization in Server Components
 */

import { cache } from "react";
import { Products, Locations } from "@/lib/supabase/queries";

/**
 * Cached product queries - products rarely change, safe to cache per request
 */
export const getCachedProducts = {
  all: cache(async () => {
    return await Products.get_all();
  }),

  byType: cache(async (type: string) => {
    return await Products.get_by_type(type);
  }),

  byTypeAndSubtype: cache(async (type: string, subtype: string) => {
    return await Products.get_by_type_and_subtype(type, subtype);
  }),

  byId: cache(async (id: string) => {
    return await Products.get_by_id(id);
  }),
};

/**
 * Cached location queries - locations are static data, safe to cache
 */
export const getCachedLocations = {
  all: cache(async () => {
    return await Locations.get_all();
  }),

  byType: cache(async (type: string) => {
    return await Locations.get_by_type(type);
  }),
};

/**
 * Generic cache wrapper for any query function
 * Usage: const cachedFn = cacheQuery(originalFn);
 */
export function cacheQuery<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return cache(fn);
}
