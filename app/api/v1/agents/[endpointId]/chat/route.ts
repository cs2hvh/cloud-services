/**
 * Public AI Agent Chat Endpoint
 * POST /api/v1/agents/[endpointId]/chat - Chat with an agent (public API)
 * 
 * This is the public-facing endpoint for integrating agents into apps
 * Supports both regular JSON responses and Server-Sent Events (SSE) streaming
 */

// Force dynamic rendering and disable response body caching for proper streaming
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { NextRequest, NextResponse } from 'next/server';
import {
  AIAgents,
  AgentModelKeys,
  AgentKBChunks,
  AgentConversations,
  AgentMessages,
  AgentUsage,
  AgentApiKeys,
  PlatformModels,
} from '@/lib/supabase/queries/ai_agents';
import { Billing } from '@/lib/supabase/queries/billing';
import {
  OpenRouterClient,
  getDefaultOpenRouterClient,
  createLLMClient,
  buildMessages,
  buildRAGSystemPrompt,
  createRAGPipeline,
  calculateCost,
} from '@/lib/ai';
import { LLMMessage, PlatformModel } from '@/lib/ai/types';
import { z } from 'zod';

// Type for clients that support streaming
type StreamingLLMClient = {
  createCompletion: OpenRouterClient['createCompletion'];
  createStreamingCompletion: OpenRouterClient['createStreamingCompletion'];
};

// Simple in-memory rate limiter for public endpoints
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, limit: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const windowMs = 60_000; // 1 minute
  
  const record = rateLimitStore.get(key);
  
  if (!record || now > record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  
  if (record.count >= limit) {
    return { allowed: false, remaining: 0 };
  }
  
  record.count++;
  return { allowed: true, remaining: limit - record.count };
}

// Validation schema for chat request
const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(32000, 'Message too long (max 32000 chars)'),
  conversation_id: z.string().uuid('Invalid conversation ID format').optional(),
  session_id: z.string().max(100, 'Session ID too long').optional(),
  user_id: z.string().max(100, 'User ID too long').optional(),
  stream: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ endpointId: string }> };

/**
 * POST /api/v1/agents/[endpointId]/chat
 * Public chat endpoint for AI agents
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { endpointId } = await params;

  try {
    // Get agent by endpoint ID
    const agentResult = await AIAgents.get_by_endpoint(endpointId);
    if (!agentResult.success || !agentResult.data) {
      return NextResponse.json(
        { error: 'Agent not found or inactive' },
        { status: 404 }
      );
    }

    const agent = agentResult.data;

    // Check if agent requires authentication
    // Auth is required when: agent is not public OR agent explicitly requires auth
    const requiresAuth = !agent.is_public || agent.require_auth;
    
    if (requiresAuth) {
      // Check for API key in header
      const apiKey = request.headers.get('x-api-key');
      if (!apiKey) {
        return NextResponse.json(
          { error: 'Authentication required. Provide x-api-key header.' },
          { status: 401 }
        );
      }
      
      // Validate API key
      const keyValidation = await AgentApiKeys.validate(apiKey, agent.id);
      if (!keyValidation.valid) {
        return NextResponse.json(
          { error: keyValidation.error || 'Invalid API key' },
          { status: 401 }
        );
      }
      
      // Record API key usage (fire and forget)
      if (keyValidation.key) {
        AgentApiKeys.record_usage(keyValidation.key.id).catch(() => {});
      }
    }

    // CORS check for allowed origins
    const origin = request.headers.get('origin');
    if (agent.allowed_origins.length > 0 && origin) {
      const isAllowed = agent.allowed_origins.some(
        allowed => allowed === '*' || allowed === origin
      );
      if (!isAllowed) {
        return NextResponse.json(
          { error: 'Origin not allowed' },
          { status: 403 }
        );
      }
    }

    // Rate limiting by IP or user
    const clientId = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    const rateLimitKey = `agent:${endpointId}:${clientId}`;
    const { allowed, remaining } = checkRateLimit(rateLimitKey, agent.rate_limit_rpm);
    
    if (!allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retry_after: 60 },
        { 
          status: 429,
          headers: { 'Retry-After': '60' },
        }
      );
    }

    // Parse request body with error handling
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
    const validation = chatRequestSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { message, conversation_id, session_id, user_id } = validation.data;

    // Check if using platform billing (do this early for parallel fetching)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usePlatformBilling = (agent as any).use_platform_billing === true;

    // OPTIMIZATION: Parallelize all pre-LLM operations
    // Start these promises early to run concurrently
    const platformModelPromise = usePlatformBilling 
      ? PlatformModels.get_by_model_id(agent.model_id) 
      : Promise.resolve(null);
    
    const balancePromise = usePlatformBilling 
      ? Billing.get_balance(agent.user_id) 
      : Promise.resolve(999); // Skip check if not using platform billing
    
    const modelKeyPromise = (!usePlatformBilling && agent.model_key_id)
      ? AgentModelKeys.get_key_with_provider(agent.model_key_id)
      : Promise.resolve(null);

    // Get or create conversation (can run in parallel with above)
    let convId = conversation_id;
    const convPromise = !convId 
      ? AgentConversations.create({
          agent_id: agent.id,
          session_id,
          external_user_id: user_id,
          title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
        })
      : Promise.resolve(null);

    // Get conversation history (if we have an existing conversation)
    const historyPromise = convId ? AgentMessages.get_recent(convId, 10) : Promise.resolve([]);

    // Wait for conversation and history in parallel
    const [convResult, history, platformModel, userBalance, modelKeyData] = await Promise.all([
      convPromise,
      historyPromise,
      platformModelPromise,
      balancePromise,
      modelKeyPromise,
    ]);

    if (!convId) {
      if (!convResult?.success || !convResult?.data) {
        return NextResponse.json(
          { error: 'Failed to create conversation' },
          { status: 500 }
        );
      }
      convId = convResult.data.id;
    }

    // Check balance for platform billing users
    if (usePlatformBilling) {
      const MIN_BALANCE_REQUIRED = 0.01;
      if (userBalance < MIN_BALANCE_REQUIRED) {
        return NextResponse.json(
          { 
            error: 'Insufficient credits',
            message: 'Agent owner has insufficient balance. Please top up credits to continue.',
            balance: userBalance,
          },
          { status: 402 }
        );
      }
    }

    const conversationHistory: LLMMessage[] = history.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));

    // RAG: Search knowledge base if enabled
    let contextChunks: { content: string; similarity: number; id: string }[] = [];
    let ragContext = '';
    
    if (agent.rag_enabled && agent.knowledge_base_ids.length > 0) {
      try {
        const ragPipeline = createRAGPipeline({
          similarityThreshold: agent.similarity_threshold,
          maxChunks: agent.max_context_chunks,
        });
        
        const queryEmbedding = await ragPipeline.embedQuery(message);
        const chunks = await AgentKBChunks.search(
          agent.knowledge_base_ids,
          queryEmbedding,
          agent.similarity_threshold,
          agent.max_context_chunks
        );
        
        contextChunks = chunks.map(c => ({
          id: c.id,
          content: c.content,
          similarity: c.similarity,
        }));
        
        ragContext = ragPipeline.formatContext(chunks);
      } catch (ragError) {
        console.error('[Agent Chat] RAG error:', ragError);
        // Continue without RAG context
      }
    }

    // Build system prompt with RAG context
    const systemPrompt = ragContext
      ? buildRAGSystemPrompt(agent.system_prompt, ragContext)
      : agent.system_prompt;

    // Build messages
    const messages = buildMessages(
      systemPrompt,
      message,
      conversationHistory
    );

    // Get LLM client - already fetched model key data in parallel above
    let client: StreamingLLMClient;
    
    if (usePlatformBilling) {
      // Platform billing - use our OpenRouter key
      client = getDefaultOpenRouterClient();
    } else if (modelKeyData) {
      // User's own API key
      client = createLLMClient(modelKeyData.provider as 'openrouter' | 'openai' | 'anthropic' | 'google' | 'mistral' | 'custom', modelKeyData.apiKey) as StreamingLLMClient;
    } else {
      // Fallback to default OpenRouter (legacy agents)
      client = getDefaultOpenRouterClient();
    }

    // Build CORS headers
    const corsHeaders: HeadersInit = {};
    if (origin && (agent.allowed_origins.includes('*') || agent.allowed_origins.includes(origin))) {
      corsHeaders['Access-Control-Allow-Origin'] = origin;
      corsHeaders['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
      corsHeaders['Access-Control-Allow-Headers'] = 'Content-Type, x-api-key';
    }

    // Check if streaming is requested
    const { stream } = validation.data;

    if (stream) {
      // ========================================
      // STREAMING RESPONSE (Server-Sent Events)
      // ========================================
      
      const encoder = new TextEncoder();
      let fullContent = '';
      let promptTokens = 0;
      let completionTokens = 0;

      const readable = new ReadableStream({
        async start(controller) {
          try {
            // Save user message first
            await AgentMessages.create({
              conversation_id: convId,
              role: 'user',
              content: message,
            });

            // Send initial event with conversation_id
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                type: 'start',
                conversation_id: convId 
              })}\n\n`)
            );

            // Stream completion from LLM
            const streamGenerator = client.createStreamingCompletion({
              model: agent.model_id,
              messages,
              max_tokens: agent.max_tokens,
              temperature: agent.temperature,
              top_p: agent.top_p,
              frequency_penalty: agent.frequency_penalty,
              presence_penalty: agent.presence_penalty,
            });

            for await (const chunk of streamGenerator) {
              const delta = chunk.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ 
                    type: 'content',
                    content: delta 
                  })}\n\n`)
                );
              }

              // Capture usage from final chunk if present
              if (chunk.usage) {
                promptTokens = chunk.usage.prompt_tokens || 0;
                completionTokens = chunk.usage.completion_tokens || 0;
              }
            }

            // Estimate tokens if not provided by the API
            if (completionTokens === 0) {
              // Rough estimate: ~4 chars per token
              completionTokens = Math.ceil(fullContent.length / 4);
              promptTokens = Math.ceil(messages.reduce((acc, m) => acc + m.content.length, 0) / 4);
            }

            const totalTokens = promptTokens + completionTokens;

            // Save assistant message
            await AgentMessages.create({
              conversation_id: convId,
              role: 'assistant',
              content: fullContent,
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: totalTokens,
              context_chunks: contextChunks,
              model_used: agent.model_id,
            });

            // Update conversation stats
            const newMessageCount = history.length + 2;
            const newTotalTokens = history.reduce((sum, m) => sum + (m.total_tokens || 0), 0) + totalTokens;
            await AgentConversations.update_stats(convId, newMessageCount, newTotalTokens);

            // Calculate cost - use platform model pricing if available
            const cost = platformModel 
              ? PlatformModels.calculate_cost(platformModel, promptTokens, completionTokens)
              : calculateCost(agent.model_id, promptTokens, completionTokens);
            
            // Deduct credits from user balance if using platform billing
            if (usePlatformBilling && cost > 0) {
              try {
                await Billing.deduct(agent.user_id, cost);
              } catch (deductErr) {
                console.error('[Agent Chat] Failed to deduct credits:', deductErr);
                // Continue anyway - we've already provided the response
              }
            }
            
            // Record usage for analytics
            AgentUsage.record(agent.id, agent.user_id, promptTokens, completionTokens, cost).catch(console.error);

            // Send final event with usage info
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'done',
                conversation_id: convId,
                usage: {
                  prompt_tokens: promptTokens,
                  completion_tokens: completionTokens,
                  total_tokens: totalTokens,
                }
              })}\n\n`)
            );

            controller.close();
          } catch (error) {
            console.error('[Agent Chat Streaming] Error:', error);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'error',
                error: error instanceof Error ? error.message : 'Streaming error'
              })}\n\n`)
            );
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no', // Disable nginx buffering
          'Transfer-Encoding': 'chunked',
          'X-RateLimit-Remaining': remaining.toString(),
          ...corsHeaders,
        },
      });
    }

    // ========================================
    // NON-STREAMING RESPONSE (JSON)
    // ========================================

    // Call LLM
    const completion = await client.createCompletion({
      model: agent.model_id,
      messages,
      max_tokens: agent.max_tokens,
      temperature: agent.temperature,
      top_p: agent.top_p,
      frequency_penalty: agent.frequency_penalty,
      presence_penalty: agent.presence_penalty,
    });

    const assistantMessage = completion.choices[0]?.message?.content || '';
    const usage = completion.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    // Save user message
    await AgentMessages.create({
      conversation_id: convId,
      role: 'user',
      content: message,
    });

    // Save assistant message
    await AgentMessages.create({
      conversation_id: convId,
      role: 'assistant',
      content: assistantMessage,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      context_chunks: contextChunks,
      model_used: agent.model_id,
    });

    // Update conversation stats
    const newMessageCount = history.length + 2;
    const newTotalTokens = history.reduce((sum, m) => sum + (m.total_tokens || 0), 0) + usage.total_tokens;
    await AgentConversations.update_stats(convId, newMessageCount, newTotalTokens);

    // Calculate cost - use platform model pricing if available
    const cost = platformModel 
      ? PlatformModels.calculate_cost(platformModel, usage.prompt_tokens, usage.completion_tokens)
      : calculateCost(agent.model_id, usage.prompt_tokens, usage.completion_tokens);
    
    // Deduct credits from user balance if using platform billing
    if (usePlatformBilling && cost > 0) {
      try {
        await Billing.deduct(agent.user_id, cost);
      } catch (deductErr) {
        console.error('[Agent Chat] Failed to deduct credits:', deductErr);
        // Continue anyway - we've already provided the response
      }
    }
    
    // Record usage for analytics
    AgentUsage.record(agent.id, agent.user_id, usage.prompt_tokens, usage.completion_tokens, cost).catch(console.error);

    // Build response with CORS headers
    const responseHeaders: HeadersInit = {
      'X-RateLimit-Remaining': remaining.toString(),
      ...corsHeaders,
    };

    return NextResponse.json(
      {
        id: convId,
        conversation_id: convId,
        message: {
          role: 'assistant',
          content: assistantMessage,
        },
        usage: {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens,
        },
      },
      { headers: responseHeaders }
    );
  } catch (err) {
    console.error('[Agent Chat] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/v1/agents/[endpointId]/chat
 * Handle CORS preflight
 */
export async function OPTIONS(request: NextRequest, { params }: RouteParams) {
  const { endpointId } = await params;
  const origin = request.headers.get('origin');

  // Get agent to check allowed origins
  const agentResult = await AIAgents.get_by_endpoint(endpointId);
  
  const headers: HeadersInit = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    'Access-Control-Max-Age': '86400',
  };

  if (agentResult.success && agentResult.data) {
    const agent = agentResult.data;
    if (origin && (agent.allowed_origins.includes('*') || agent.allowed_origins.includes(origin))) {
      headers['Access-Control-Allow-Origin'] = origin;
    }
  }

  return new NextResponse(null, { status: 204, headers });
}
