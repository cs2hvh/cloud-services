/**
 * AI Agents - List & Create Endpoints
 * GET /api/ai-agents - List user's agents
 * POST /api/ai-agents - Create a new agent
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/server-auth';
import { limitByUser } from '@/lib/cooldown/userbased';
import { AIAgents } from '@/lib/supabase/queries/ai_agents';
import { AIAgentInsert } from '@/lib/ai/types';
import { NotificationService, createServiceNotification } from '@/lib/notifications/service';
import { z } from 'zod';

// Validation schema for creating an agent
const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  avatar_url: z.string().url().optional(),
  system_prompt: z.string().min(10).max(10000),
  welcome_message: z.string().max(1000).optional(),
  model_id: z.string().min(1),
  model_key_id: z.string().uuid().optional().nullable(),
  use_platform_billing: z.boolean().optional(),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().min(1).max(128000).optional(),
  top_p: z.number().min(0).max(1).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  knowledge_base_ids: z.array(z.string().uuid()).optional(),
  rag_enabled: z.boolean().optional(),
  similarity_threshold: z.number().min(0).max(1).optional(),
  max_context_chunks: z.number().min(1).max(20).optional(),
  is_public: z.boolean().optional(),
  require_auth: z.boolean().optional(),
  allowed_origins: z.array(z.string()).optional(),
  rate_limit_rpm: z.number().min(1).optional(),
  project_id: z.string().uuid().optional(),
});

/**
 * GET /api/ai-agents
 * List all agents for the authenticated user
 */
export async function GET() {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: 'rl:ai-agents-list',
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    const agents = await AIAgents.list_by_user(auth.user!.id);

    return NextResponse.json({
      success: true,
      data: agents,
    });
  } catch (err) {
    console.error('[AI Agents] List error:', err);
    return NextResponse.json(
      { error: 'Failed to list agents' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai-agents
 * Create a new AI agent
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateUser();
  if (!auth.authenticated) return auth.response;

  try {
    // Rate limiting
    const rl = await limitByUser(auth.user!.id, {
      prefix: 'rl:ai-agents-create',
      limit: 10,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too Many Requests', message: `Retry after ${rl.retryAfterSec}s` },
        { status: 429 }
      );
    }

    // Check agent limit (e.g., max 10 agents per user)
    const agentCount = await AIAgents.count_by_user(auth.user!.id);
    const MAX_AGENTS = 10;
    if (agentCount >= MAX_AGENTS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_AGENTS} agents allowed per account` },
        { status: 400 }
      );
    }

    // Parse and validate body
    const body = await request.json();
    console.log('[AI Agents] Received body:', JSON.stringify(body, null, 2));
    const validation = createAgentSchema.safeParse(body);
    
    if (!validation.success) {
      console.log('[AI Agents] Validation errors:', JSON.stringify(validation.error.errors, null, 2));
      return NextResponse.json(
        { error: 'Validation error', details: validation.error.errors },
        { status: 400 }
      );
    }

    const data = validation.data;

    // Generate unique endpoint ID
    const endpoint_id = await AIAgents.generate_endpoint_id();

    // Create the agent
    const payload: AIAgentInsert = {
      name: data.name,
      description: data.description,
      avatar_url: data.avatar_url,
      system_prompt: data.system_prompt,
      welcome_message: data.welcome_message,
      model_id: data.model_id,
      model_key_id: data.model_key_id || null,
      use_platform_billing: data.use_platform_billing ?? false,
      temperature: data.temperature ?? 0.7,
      max_tokens: data.max_tokens ?? 4096,
      top_p: data.top_p ?? 1.0,
      frequency_penalty: data.frequency_penalty ?? 0,
      presence_penalty: data.presence_penalty ?? 0,
      knowledge_base_ids: data.knowledge_base_ids ?? [],
      rag_enabled: data.rag_enabled ?? false,
      similarity_threshold: data.similarity_threshold ?? 0.7,
      max_context_chunks: data.max_context_chunks ?? 5,
      endpoint_id,
      is_public: data.is_public ?? false,
      require_auth: data.require_auth ?? true,
      allowed_origins: data.allowed_origins ?? [],
      rate_limit_rpm: data.rate_limit_rpm ?? 60,
      user_id: auth.user!.id,
      project_id: data.project_id,
    };

    const result = await AIAgents.create(payload);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to create agent' },
        { status: 400 }
      );
    }

    // Create notification
    const notificationParams = createServiceNotification({
      userId: auth.user!.id,
      serviceType: 'ai_agent',
      action: 'created',
      serviceName: data.name,
      serviceId: result.data?.id,
      metadata: {
        modelId: data.model_id,
        ragEnabled: data.rag_enabled ?? false,
        isPublic: data.is_public ?? false,
      },
    });
    await NotificationService.create(notificationParams);

    return NextResponse.json({
      success: true,
      data: result.data,
    }, { status: 201 });
  } catch (err) {
    console.error('[AI Agents] Create error:', err);
    return NextResponse.json(
      { error: 'Failed to create agent' },
      { status: 500 }
    );
  }
}
