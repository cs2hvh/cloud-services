/**
 * Platform Models API
 * GET /api/ai-agents/platform-models - List available models for AI Agents
 * 
 * Returns the list of platform-provided models that can be used
 * when creating agents without a custom API key.
 */

import { NextResponse } from "next/server";
import { PlatformModels } from "@/lib/supabase/queries/ai_agents";
import type { PlatformModel } from "@/lib/ai/types";

// Fallback models when database is not yet migrated
const FALLBACK_MODELS = [
  {
    model_id: 'openai/gpt-5-nano',
    display_name: 'GPT-5 Nano',
    provider: 'openai',
    description: 'Fast and efficient for simple tasks',
    input_cost_per_million: 0.05,
    output_cost_per_million: 0.40,
    context_window: 128000,
    supports_vision: false,
    supports_function_calling: true,
    supports_streaming: true,
    is_free: false,
  },
  {
    model_id: 'openai/gpt-5.2',
    display_name: 'GPT-5.2',
    provider: 'openai',
    description: 'Most capable OpenAI model for complex reasoning',
    input_cost_per_million: 1.75,
    output_cost_per_million: 14.00,
    context_window: 128000,
    supports_vision: true,
    supports_function_calling: true,
    supports_streaming: true,
    is_free: false,
  },
  {
    model_id: 'openai/gpt-oss-120b:free',
    display_name: 'GPT OSS 120B (Free)',
    provider: 'openai',
    description: 'Open-source model with generous free tier',
    input_cost_per_million: 0.039,
    output_cost_per_million: 0.19,
    context_window: 128000,
    supports_vision: false,
    supports_function_calling: true,
    supports_streaming: true,
    is_free: true,
  },
  {
    model_id: 'anthropic/claude-sonnet-4.5',
    display_name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    description: 'Balanced performance and capability',
    input_cost_per_million: 3.00,
    output_cost_per_million: 15.00,
    context_window: 200000,
    supports_vision: true,
    supports_function_calling: true,
    supports_streaming: true,
    is_free: false,
  },
  {
    model_id: 'anthropic/claude-haiku-4.5',
    display_name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    description: 'Fast and affordable for high-volume tasks',
    input_cost_per_million: 1.00,
    output_cost_per_million: 5.00,
    context_window: 200000,
    supports_vision: true,
    supports_function_calling: true,
    supports_streaming: true,
    is_free: false,
  },
  {
    model_id: 'google/gemini-3-flash-preview',
    display_name: 'Gemini 3 Flash',
    provider: 'google',
    description: 'Ultra-fast responses with great quality',
    input_cost_per_million: 0.50,
    output_cost_per_million: 3.00,
    context_window: 1000000,
    supports_vision: true,
    supports_function_calling: true,
    supports_streaming: true,
    is_free: false,
  },
  {
    model_id: 'deepseek/deepseek-v3.2',
    display_name: 'DeepSeek V3.2',
    provider: 'deepseek',
    description: 'Excellent value for reasoning tasks',
    input_cost_per_million: 0.25,
    output_cost_per_million: 0.38,
    context_window: 128000,
    supports_vision: false,
    supports_function_calling: true,
    supports_streaming: true,
    is_free: false,
  },
];

// Fill missing PlatformModel required fields for TypeScript compatibility
const FILLED_FALLBACK_MODELS: PlatformModel[] = FALLBACK_MODELS.map((m) => ({
  id: m.model_id,
  model_id: m.model_id,
  display_name: m.display_name,
  provider: m.provider,
  description: m.description ?? null,
  input_cost_per_million: m.input_cost_per_million,
  output_cost_per_million: m.output_cost_per_million,
  context_window: m.context_window,
  supports_vision: m.supports_vision,
  supports_function_calling: m.supports_function_calling,
  supports_streaming: m.supports_streaming,
  is_active: true,
  is_free: m.is_free,
  sort_order: 0,
  created_at: '1970-01-01T00:00:00Z',
  updated_at: '1970-01-01T00:00:00Z',
}));

/**
 * GET /api/ai-agents/platform-models
 * List all active platform models available for selection
 */
export async function GET() {
  try {
    let models = await PlatformModels.list_active();
    
    // Use fallback if database returns empty (migration not run yet)
    if (!models || models.length === 0) {
      models = FILLED_FALLBACK_MODELS;
    }
    
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
    
    // Return fallback models even on error
    const formattedModels = FILLED_FALLBACK_MODELS.map(model => ({
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

    return NextResponse.json({
      success: true,
      data: formattedModels,
    });
  }
}
