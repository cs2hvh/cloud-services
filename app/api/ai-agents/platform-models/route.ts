/**
 * Platform Models API
 * GET /api/ai-agents/platform-models - List available models for AI Agents
 * 
 * Returns the list of platform-provided models that can be used
 * when creating agents without a custom API key.
 */

import { NextResponse } from "next/server";
import { PlatformModels } from "@/lib/supabase/queries/ai_agents";

// Fallback models when database is not yet migrated
/**
 * There is deliberately NO hardcoded fallback catalogue here any more.
 *
 * There used to be one, and its prices were our upstream COST — 0.05/0.40 for
 * gpt-5-nano, where the platform sells at 0.10/0.80. It was served whenever the
 * database came back empty or threw, i.e. exactly when nobody was watching, on
 * an endpoint that needs no credential. That published our cost basis and, with
 * a customer's own bill alongside it, our markup.
 *
 * An empty catalogue is the honest answer to "we could not read the catalogue".
 * Offering a model we cannot price is how the billing side went wrong in the
 * first place (see withPlatformPricing in lib/supabase/queries/ai_agents.ts).
 */

/**
 * GET /api/ai-agents/platform-models
 * List all active platform models available for selection
 */
export async function GET() {
  try {
    // Prices come from inference.models via withPlatformPricing — the same
    // figure the platform bills at. Models it cannot price are withheld.
    const models = await PlatformModels.list_active();

    // Transform for frontend consumption
    const formattedModels = models.map(model => ({
      id: model.model_id,
      name: model.display_name,
      provider: model.provider,
      description: model.description,
      pricing: {
        input: model.input_cost_per_million,
        output: model.output_cost_per_million,
        inputFormatted: `$${model.input_cost_per_million}/M tokens`,
        outputFormatted: `$${model.output_cost_per_million}/M tokens`,
      },
      contextWindow: model.context_window,
      capabilities: {
        vision: model.supports_vision,
        functionCalling: model.supports_function_calling,
        streaming: model.supports_streaming,
      },
      isFree: model.is_free,
    }));

    const response = NextResponse.json({
      success: true,
      data: formattedModels,
    });
    // Public platform model catalog — safe to cache at the edge for a few
    // minutes (only the primary success path; the error fallback below is not
    // cached so a transient failure can't be pinned).
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=600, stale-while-revalidate=3600"
    );
    return response;
  } catch (error) {
    console.error("[Platform Models API] Error listing models:", error);

    // Empty, not a stale price list. This endpoint is public and uncredentialed;
    // guessing at prices here is how the cost basis leaked before.
    return NextResponse.json(
      { success: false, error: "Model catalogue is temporarily unavailable", data: [] },
      { status: 503 }
    );
  }
}
