/**
 * GET /v1/models — flat catalog with capability flags.
 *
 * Returns every active model the calling org can see:
 *   • public models (org_id IS NULL — frontier proxied models)
 *   • models private to the calling org (FT outputs, BYO deploys)
 *
 * Shape is OpenAI-compatible (`{ object: "list", data: [...] }`) with
 * AhuraCloud-specific extras (display_name, modality, capabilities,
 * pricing, off_peak, featured) attached to each entry.
 */
import type { Handler } from "hono";
import { createClient } from "@supabase/supabase-js";
import type { Env, HonoVariables } from "../types.ts";
import { virtualRouterModels } from "../lib/router.ts";

/**
 * Vendor from the catalog id ("openai/gpt-4o-mini" → "openai"). Ids are always
 * "vendor/name"; anything without a slash is one of ours, so it falls back to
 * "ahura" rather than inventing a vendor.
 */
function vendorOf(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash > 0 ? modelId.slice(0, slash) : "ahura";
}

interface ModelRow {
  model_id: string;
  display_name: string;
  description: string | null;
  modality: string;
  serving_type: string;
  capabilities: Record<string, unknown>;
  pricing: Record<string, unknown>;
  off_peak: Record<string, unknown> | null;
  is_featured: boolean;
  sort_order: number;
  org_id: string | null;
}

export const listModels: Handler<{
  Bindings: Env;
  Variables: HonoVariables;
}> = async (c) => {
  const auth = c.get("auth");

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "ahura-inference-edge" } },
  });

  const { data, error } = await supabase
    .schema("inference")
    .from("models")
    .select(
      "model_id, display_name, description, modality, serving_type, capabilities, pricing, off_peak, is_featured, sort_order, org_id"
    )
    .eq("is_active", true)
    .or(`org_id.is.null,org_id.eq.${auth.orgId}`)
    .order("sort_order", { ascending: true })
    .returns<ModelRow[]>();

  if (error) {
    console.error(
      JSON.stringify({
        level: "error",
        requestId: c.get("requestId"),
        message: "Model catalog fetch failed",
        err: error.message,
      })
    );
    return c.json(
      {
        error: {
          message: "Failed to fetch model catalog",
          type: "internal_error",
          code: "catalog_error",
          request_id: c.get("requestId"),
        },
      },
      500
    );
  }

  // The virtual router ids first — they are the recommended entry point, and
  // they are not rows in inference.models so the query above cannot return them.
  const virtual = virtualRouterModels().map((v) => ({
    id: v.id,
    object: "model" as const,
    created: 0,
    owned_by: "ahura",
    display_name: v.display_name,
    description: v.description,
    modality: "chat",
    // Capabilities and price depend on the model the router resolves to per
    // request, so quoting either here would be wrong. X-Ahura-Model on the
    // response tells the caller what actually ran.
    capabilities: {},
    pricing: null,
    off_peak: null,
    featured: true,
  }));

  return c.json({
    object: "list",
    data: [
      ...virtual,
      ...(data ?? []).map((m) => ({
        id: m.model_id,
        object: "model",
        created: 0,
        // The model VENDOR ("openai", "anthropic", ...), taken from the id
        // prefix — matching both OpenAI's own /v1/models convention and the
        // shape documented in docs/inference/api-reference.md.
        //
        // This previously returned the UPSTREAM ROUTER's name for every proxied
        // model (77 of 80 entries), which is a brand leak: the platform rule is
        // that upstream provider names never appear in user-visible UI, API
        // responses or errors, and this route is not covered by brand-scrub.ts
        // (that wraps completion payloads, not the catalog).
        owned_by: m.org_id ? "ahura-private" : vendorOf(m.model_id),
        display_name: m.display_name,
        description: m.description,
        modality: m.modality,
        capabilities: m.capabilities,
        pricing: m.pricing,
        off_peak: m.off_peak,
        featured: m.is_featured,
      })),
    ],
  });
};
