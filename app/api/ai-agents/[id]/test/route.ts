/**
 * AI Agents - Test/Playground Endpoint
 * POST /api/ai-agents/[id]/test - Test an agent with a message (owner only)
 */

// Force dynamic rendering and disable response body caching for proper streaming
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { limitByUser } from '@/lib/cooldown/userbased';
import {
  AIAgents,
  AgentModelKeys,
  AgentKBChunks,
  AgentConversations,
  AgentMessages,
  AgentUsage,
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
import { LLMMessage } from '@/lib/ai/types';
import { z } from 'zod';

const testRequestSchema = z.object({
  message: z.string().min(1).max(10000),
  conversation_id: z.string().uuid().optional(),
  stream: z.boolean().optional().default(false),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/ai-agents/[id]/test
 * Test an agent (playground mode for owner)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  const { id } = await params;

  try {
    // Rate limiting - stricter for AI calls
    const rl = await limitByUser(auth.user!.id, {
      prefix: 'rl:ai-agents-test',
      limit: 20,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    // Get agent and verify ownership
    const agentResult = await AIAgents.get(id, auth.user!.id);
    if (!agentResult.success || !agentResult.data) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      );
    }

    const agent = agentResult.data;

    // Parse request
    const body = await request.json();
    const validation = testRequestSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation error', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { message, conversation_id, stream } = validation.data;

    // Timing for performance debugging
    const startTime = Date.now();
    const logTime = (label: string) => console.log(`[AI Agent Test] ${label}: ${Date.now() - startTime}ms`);

    // Check if using platform billing (do this early for parallel fetching)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usePlatformBilling = (agent as any).use_platform_billing === true;

    // OPTIMIZATION: Start all parallel fetches early
    const platformModelPromise = usePlatformBilling 
      ? PlatformModels.get_by_model_id(agent.model_id) 
      : Promise.resolve(null);
    
    const balancePromise = usePlatformBilling 
      ? Billing.get_balance(auth.user!.id) 
      : Promise.resolve(999);
    
    const modelKeyPromise = (!usePlatformBilling && agent.model_key_id)
      ? AgentModelKeys.get_key_with_provider(agent.model_key_id)
      : Promise.resolve(null);

    // Get or create conversation
    let convId = conversation_id;
    const convPromise = !convId ? AgentConversations.create({
      agent_id: id,
      user_id: auth.user!.id,
      title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
    }) : Promise.resolve(null);

    // Get conversation history in parallel
    const historyPromise = convId ? AgentMessages.get_recent(convId, 10) : Promise.resolve([]);

    // Wait for ALL promises in parallel
    const [convResult, history, platformModel, userBalance, modelKeyData] = await Promise.all([
      convPromise, 
      historyPromise,
      platformModelPromise,
      balancePromise,
      modelKeyPromise,
    ]);
    logTime('DB parallel fetch complete');
    
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
            message: 'You have insufficient balance. Please top up credits to continue.',
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
    let contextChunks: { content: string; similarity: number; id: string; knowledge_base_id: string; document_id: string; metadata: Record<string, unknown> }[] = [];
    let ragContext = '';
    
    if (agent.rag_enabled && agent.knowledge_base_ids && agent.knowledge_base_ids.length > 0) {
      try {
        const ragPipeline = createRAGPipeline({
          similarityThreshold: agent.similarity_threshold || 0.5,
          maxChunks: agent.max_context_chunks || 5,
        });
        
        const queryEmbedding = await ragPipeline.embedQuery(message);
        logTime('RAG embedding complete');
        
        const chunks = await AgentKBChunks.search(
          agent.knowledge_base_ids,
          queryEmbedding,
          agent.max_context_chunks || 5
        );
        logTime('RAG search complete');
        
        contextChunks = chunks.map(c => ({
          id: c.id,
          content: c.content,
          similarity: c.similarity,
          knowledge_base_id: c.knowledge_base_id,
          document_id: c.document_id,
          metadata: c.metadata || {},
        }));
        
        ragContext = ragPipeline.formatContext(chunks);
      } catch (ragError) {
        console.error('[AI Agents Test] RAG error:', ragError);
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
    let client: OpenRouterClient | ReturnType<typeof createLLMClient>;
    
    if (usePlatformBilling) {
      // Platform billing - use our OpenRouter key
      client = getDefaultOpenRouterClient();
    } else if (modelKeyData) {
      // User's own API key
      client = createLLMClient(modelKeyData.provider as 'openrouter' | 'openai' | 'anthropic' | 'google' | 'mistral' | 'custom', modelKeyData.apiKey);
    } else {
      // Fallback to default OpenRouter (legacy agents)
      client = getDefaultOpenRouterClient();
    }

    // Streaming mode - use direct pipe for speed (like Vercel AI SDK)
    if (stream) {
      logTime('Pre-LLM setup complete, starting stream');
      
      // Save user message immediately (don't wait)
      AgentMessages.create({
        conversation_id: convId,
        role: 'user',
        content: message,
      }).catch(console.error);

      // Get raw stream from OpenRouter
      const openRouterClient = client as OpenRouterClient;
      logTime('Starting OpenRouter stream request');
      const { stream: rawStream } = await openRouterClient.createStreamingCompletionRaw({
        model: agent.model_id,
        messages,
        max_tokens: agent.max_tokens,
        temperature: agent.temperature,
        top_p: agent.top_p,
        frequency_penalty: agent.frequency_penalty,
        presence_penalty: agent.presence_penalty,
      });
      logTime('OpenRouter stream connection established');

      let fullContent = '';
      let promptTokens = 0;
      let completionTokens = 0;
      let firstChunkLogged = false;
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      // Create a custom ReadableStream that manually pipes data (avoids TransformStream buffering)
      const outputStream = new ReadableStream({
        async start(controller) {
          const reader = rawStream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              if (!firstChunkLogged) {
                firstChunkLogged = true;
                console.log(`[AI Agent Test] First chunk received: ${Date.now() - startTime}ms`);
              }

              const text = decoder.decode(value, { stream: true });
              const lines = text.split('\n');

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (!trimmed.startsWith('data: ')) continue;

                try {
                  const json = JSON.parse(trimmed.slice(6));
                  const delta = json.choices?.[0]?.delta?.content;
                  if (delta) {
                    fullContent += delta;
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: 'content', content: delta })}\n\n`)
                    );
                  }
                  if (json.usage) {
                    promptTokens = json.usage.prompt_tokens || 0;
                    completionTokens = json.usage.completion_tokens || 0;
                  }
                } catch {
                  // Skip invalid JSON
                }
              }
            }

            // Estimate tokens if not provided
            if (completionTokens === 0) {
              promptTokens = Math.ceil(messages.reduce((acc, m) => acc + m.content.length, 0) / 4);
              completionTokens = Math.ceil(fullContent.length / 4);
            }
            const totalTokens = promptTokens + completionTokens;
            
            // Calculate cost using platform model pricing if available
            const cost = platformModel 
              ? PlatformModels.calculate_cost(platformModel, promptTokens, completionTokens)
              : calculateCost(agent.model_id, promptTokens, completionTokens);

            // Send done event
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                type: 'done', 
                conversation_id: convId,
                usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: totalTokens, cost: cost.toFixed(6) }
              })}\n\n`)
            );
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();

            // Save in background and deduct credits (non-blocking)
            const savePromises: Promise<unknown>[] = [
              AgentMessages.create({
                conversation_id: convId,
                role: 'assistant',
                content: fullContent,
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: totalTokens,
                context_chunks: contextChunks,
                model_used: agent.model_id,
              }),
              AgentConversations.update_stats(convId, history.length + 2, history.reduce((sum, m) => sum + (m.total_tokens || 0), 0) + totalTokens),
              AgentUsage.record(id, auth.user!.id, promptTokens, completionTokens, cost),
            ];
            
            // Deduct credits if using platform billing
            if (usePlatformBilling && cost > 0) {
              savePromises.push(Billing.deduct(auth.user!.id, cost).catch(err => {
                console.error('[AI Agents Test] Failed to deduct credits:', err);
              }));
            }
            
            Promise.all(savePromises).catch(console.error);
          } catch (err) {
            controller.error(err);
          } finally {
            reader.releaseLock();
          }
        },
      });

      return new Response(outputStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no', // Disable nginx buffering
          'Transfer-Encoding': 'chunked',
        },
      });
    }

    // Non-streaming mode (original behavior)
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

    // Calculate cost using platform model pricing if available
    const cost = platformModel 
      ? PlatformModels.calculate_cost(platformModel, usage.prompt_tokens, usage.completion_tokens)
      : calculateCost(agent.model_id, usage.prompt_tokens, usage.completion_tokens);
    
    // Deduct credits if using platform billing
    if (usePlatformBilling && cost > 0) {
      try {
        await Billing.deduct(auth.user!.id, cost);
      } catch (deductErr) {
        console.error('[AI Agents Test] Failed to deduct credits:', deductErr);
      }
    }
    
    // Record usage for analytics
    await AgentUsage.record(id, auth.user!.id, usage.prompt_tokens, usage.completion_tokens, cost);

    return NextResponse.json({
      success: true,
      data: {
        conversation_id: convId,
        message: {
          role: 'assistant',
          content: assistantMessage,
        },
        usage: {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens,
          cost: cost.toFixed(6),
        },
        context: contextChunks.length > 0 ? contextChunks : undefined,
      },
    });
  } catch (err) {
    console.error('[AI Agents Test] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to process request' },
      { status: 500 }
    );
  }
}
